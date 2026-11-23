// @vitest-environment node
import { verifyJwtHmac, extractBearerToken } from "eve/channels/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commandMessage, parseCommand, type EngineCommand } from "./commands";
import {
  CHANNEL_JWT,
  courseBuilderUrl,
  sendToAgent,
  signChannelToken,
} from "./eve-client";

const SECRET = "test-channel-secret-0123456789abcdef";
const BASE = "http://agent.test/eve";
const cmd: EngineCommand = { action: "write", jobId: "j1" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Call = { url: string; init: RequestInit };
function fakeFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const bodyOf = (call: Call) =>
  JSON.parse(call.init.body as string) as { message: string };
const tokenOf = (call: Call) =>
  extractBearerToken(
    (call.init.headers as Record<string, string>).authorization,
  );

/** The channel's own verifier config (agents/course-builder/agent/channels/eve.ts). */
const verify = (token: string | null, secret = SECRET) =>
  verifyJwtHmac(token, {
    algorithm: "HS256",
    issuer: CHANNEL_JWT.issuer,
    audiences: [CHANNEL_JWT.audience],
    subjects: [CHANNEL_JWT.subject],
    secret,
  });

afterEach(() => vi.unstubAllEnvs());

describe("signChannelToken", () => {
  it("signs an HS256 service token the channel accepts, expiring in 60 s", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signChannelToken(SECRET, now);
    const [header, payload] = token
      .split(".")
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(payload).toMatchObject({
      iss: "llm-platform",
      aud: "course-builder",
      sub: "course-builder-route",
      iat: now,
      exp: now + 60,
    });
    const result = await verify(token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessionAuth.principalType).toBe("service");
  });

  it("is rejected with another secret or once expired", async () => {
    expect((await verify(signChannelToken(SECRET), "other-secret")).ok).toBe(
      false,
    );
    const old = Math.floor(Date.now() / 1000) - 600;
    expect((await verify(signChannelToken(SECRET, old))).ok).toBe(false);
  });
});

describe("sendToAgent", () => {
  it("creates a session when there is no session id", async () => {
    const { fetch, calls } = fakeFetch(
      json(202, { ok: true, sessionId: "wrun_new", deliveryId: "d1" }),
    );
    await expect(
      sendToAgent(cmd, undefined, { baseUrl: BASE, secret: SECRET, fetch }),
    ).resolves.toEqual({
      sessionId: "wrun_new",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/session`);
    expect(calls[0].init.method).toBe("POST");
    expect(bodyOf(calls[0]).message).toBe(commandMessage(cmd));
    expect(parseCommand(bodyOf(calls[0]).message)).toEqual(cmd);
    expect((await verify(tokenOf(calls[0]))).ok).toBe(true);
  });

  it("sends a follow-up to the stored session", async () => {
    const { fetch, calls } = fakeFetch(
      json(202, { ok: true, deliveryId: "d2" }),
    );
    await expect(
      sendToAgent(cmd, "wrun_old", { baseUrl: BASE, secret: SECRET, fetch }),
    ).resolves.toEqual({
      sessionId: "wrun_old",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/session/wrun_old`);
    expect(bodyOf(calls[0]).message).toBe(commandMessage(cmd));
    expect((await verify(tokenOf(calls[0]))).ok).toBe(true);
  });

  it.each([409, 500])(
    "starts a new session with the same message when the follow-up returns %i",
    async (status) => {
      const { fetch, calls } = fakeFetch(
        json(status, { ok: false, code: "session_not_active" }),
        json(202, { ok: true, sessionId: "wrun_fresh", deliveryId: "d3" }),
      );
      await expect(
        sendToAgent(cmd, "wrun_gone", { baseUrl: BASE, secret: SECRET, fetch }),
      ).resolves.toEqual({
        sessionId: "wrun_fresh",
      });
      expect(calls.map((c) => c.url)).toEqual([
        `${BASE}/v1/session/wrun_gone`,
        `${BASE}/v1/session`,
      ]);
      expect(bodyOf(calls[1]).message).toBe(bodyOf(calls[0]).message);
    },
  );

  it("throws on any other non-2xx, without leaking the secret", async () => {
    const { fetch } = fakeFetch(json(401, { ok: false, code: "unauthorized" }));
    const err = await sendToAgent(cmd, "wrun_old", {
      baseUrl: BASE,
      secret: SECRET,
      fetch,
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/401/);
    expect((err as Error).message).not.toContain(SECRET);
  });

  it("throws when a create answers without a session id", async () => {
    const { fetch } = fakeFetch(json(202, { ok: true }));
    await expect(
      sendToAgent(cmd, undefined, { baseUrl: BASE, secret: SECRET, fetch }),
    ).rejects.toThrow(/session id/);
  });

  it("refuses to run without the channel secret", async () => {
    vi.stubEnv("COURSE_BUILDER_CHANNEL_SECRET", "");
    const { fetch, calls } = fakeFetch();
    await expect(
      sendToAgent(cmd, undefined, { baseUrl: BASE, fetch }),
    ).rejects.toThrow(/COURSE_BUILDER_CHANNEL_SECRET/);
    expect(calls).toHaveLength(0);
  });
});

describe("courseBuilderUrl", () => {
  it("uses COURSE_BUILDER_URL, else the local dev:course-builder server", () => {
    expect(
      courseBuilderUrl({ COURSE_BUILDER_URL: "https://agent.example/eve/" }),
    ).toBe("https://agent.example/eve");
    expect(courseBuilderUrl({})).toBe("http://127.0.0.1:2001/eve");
  });
});
