import { createHmac } from "node:crypto";
import { commandMessage, type EngineCommand } from "./commands";

/**
 * Next.js -> course-builder agent (live dispatch). Service-to-service: each request carries a
 * fresh HS256 JWT signed with `COURSE_BUILDER_CHANNEL_SECRET`, which the agent's `jwtHmac`
 * channel (agents/course-builder/agent/channels/eve.ts) verifies with the same claims; eve tags
 * such callers `principalType: "service"`. Server code only; never logs the secret or a token.
 *
 * Convex is the only memory: every command carries `jobId`, so when a stored session is gone
 * (409 `session_not_active`) or stranded (500 after a plain `eve dev` restart), the command goes
 * to a fresh session instead and the caller stores the new id.
 */

/** Claims shared by the signer (here) and the agent's channel verifier. */
export const CHANNEL_JWT = {
  issuer: "llm-platform",
  audience: "course-builder",
  subject: "course-builder-route",
  ttlSeconds: 60,
} as const;

/** `npm run dev:course-builder` listens here (Learnly's `eve dev` keeps the default 2000). */
const DEFAULT_URL = "http://127.0.0.1:2001/eve";
const TIMEOUT_MS = 15_000;

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export function signChannelToken(
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    iss: CHANNEL_JWT.issuer,
    aud: CHANNEL_JWT.audience,
    sub: CHANNEL_JWT.subject,
    iat: nowSeconds,
    exp: nowSeconds + CHANNEL_JWT.ttlSeconds,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** Base URL the agent's `/v1/*` routes hang off: `COURSE_BUILDER_URL`, else the local dev server. */
export function courseBuilderUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.COURSE_BUILDER_URL || DEFAULT_URL).replace(/\/+$/, "");
}

type Options = { baseUrl?: string; secret?: string; fetch?: typeof fetch };

/**
 * Sends `commandMessage(cmd)` to the agent: a follow-up to `sessionId` when given, else (or when
 * that session is gone) a new session. Resolves with the session that got the message; throws on
 * anything else so the route records `dispatchError`.
 */
export async function sendToAgent(
  cmd: EngineCommand,
  sessionId?: string,
  options: Options = {},
): Promise<{ sessionId: string }> {
  const secret =
    options.secret ?? process.env.COURSE_BUILDER_CHANNEL_SECRET ?? "";
  if (!secret)
    throw new Error(
      "course-builder agent not configured (COURSE_BUILDER_CHANNEL_SECRET missing)",
    );
  const baseUrl = (options.baseUrl ?? courseBuilderUrl()).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const message = commandMessage(cmd);

  const post = async (path: string) => {
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${signChannelToken(secret)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `course-builder agent unreachable at ${baseUrl}: ${reason}`,
      );
    }
  };
  const failure = async (res: Response) => {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return new Error(
      `course-builder agent answered HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  };

  if (sessionId) {
    const res = await post(`/v1/session/${encodeURIComponent(sessionId)}`);
    if (res.ok) return { sessionId };
    if (res.status !== 409 && res.status !== 500) throw await failure(res);
    // The session is gone or stranded: fall through to a fresh one with the same message.
  }

  const res = await post("/v1/session");
  if (!res.ok) throw await failure(res);
  const body = (await res.json().catch(() => null)) as {
    sessionId?: unknown;
  } | null;
  if (typeof body?.sessionId !== "string" || body.sessionId === "") {
    throw new Error(
      "course-builder agent created a session without a session id",
    );
  }
  return { sessionId: body.sessionId };
}
