import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REGENERATE_PUBLISHED_MESSAGE } from "../../../../../convex/generation";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

const dispatchMock = vi.fn();
vi.mock("@/lib/course-builder/dispatch", () => ({
  dispatch: (...a: unknown[]) => dispatchMock(...a),
}));

type Handler = (args: Record<string, unknown>) => unknown;
const handlers = new Map<string, Handler>();
const callLog: string[] = [];
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    private run(ref: never, args: Record<string, unknown>) {
      const name = getFunctionName(ref);
      callLog.push(name);
      const h = handlers.get(name);
      if (!h) throw new Error(`unmocked ${name}`);
      return Promise.resolve().then(() => h(args));
    }
    mutation(ref: never, args: Record<string, unknown>) {
      return this.run(ref, args);
    }
    query(ref: never, args: Record<string, unknown>) {
      return this.run(ref, args);
    }
  },
}));

import { POST } from "./route";

const call = (action: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/course-builder/${action}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
const asAdmin = () =>
  authMock.mockResolvedValue({
    userId: "u1",
    sessionClaims: { metadata: { role: "admin" } },
    getToken: async () => "tok",
  });
let job: Record<string, unknown>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  authMock.mockReset();
  dispatchMock.mockReset().mockResolvedValue({ sessionId: "sess-1" });
  handlers.clear();
  callLog.length = 0;
  job = { _id: "j1", status: "queued" };
  handlers.set("generation:get", () => job);
  handlers.set("generation:markDispatched", () => null);
  handlers.set("generation:markDispatchError", () => null);
  asAdmin();
});

describe("POST /api/course-builder/[action]", () => {
  it("403s for a signed-out user and a non-admin, without touching Convex", async () => {
    authMock.mockResolvedValue({
      userId: null,
      sessionClaims: null,
      getToken: async () => null,
    });
    expect((await call("start", { jobId: "j1" })).status).toBe(403);
    authMock.mockResolvedValue({
      userId: "u2",
      sessionClaims: { metadata: { role: "student" } },
      getToken: async () => "t",
    });
    expect((await call("start", { jobId: "j1" })).status).toBe(403);
    expect(callLog).toEqual([]);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("400s for an unknown action, bad JSON, or a missing jobId", async () => {
    expect((await call("nuke", { jobId: "j1" })).status).toBe(400);
    expect((await call("start", "{nope")).status).toBe(400);
    expect((await call("start", {})).status).toBe(400);
    expect((await call("regenerate", { jobId: "j1" })).status).toBe(400);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("start: startJob then dispatch research then markDispatched", async () => {
    handlers.set("generation:startJob", () => null);
    const res = await call("start", { jobId: "j1" });
    expect(res.status).toBe(200);
    expect(callLog).toEqual([
      "generation:startJob",
      "generation:markDispatched",
    ]);
    expect(dispatchMock).toHaveBeenCalledWith(
      { action: "research", jobId: "j1" },
      expect.anything(),
    );
  });

  it("approve: a double submit gives one transition + one dispatch, the second is 409 with the status", async () => {
    let approved = false;
    handlers.set("generation:approveOutline", () => {
      if (approved) throw new ConvexError("BAD_STATE");
      approved = true;
      return "course1";
    });
    job = { _id: "j1", status: "writing" };
    const first = await call("approve", { jobId: "j1" });
    const second = await call("approve", { jobId: "j1" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: "BAD_STATE",
      status: "writing",
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      { action: "write", jobId: "j1" },
      expect.anything(),
    );
  });

  it("dispatch failure records dispatchError and returns 502", async () => {
    handlers.set("generation:startJob", () => null);
    dispatchMock.mockRejectedValue(
      new Error("course-builder agent not configured"),
    );
    const markError = vi.fn(() => null);
    handlers.set("generation:markDispatchError", markError);
    const res = await call("start", { jobId: "j1" });
    expect(res.status).toBe(502);
    expect(markError).toHaveBeenCalledWith({
      jobId: "j1",
      error: "course-builder agent not configured",
    });
    expect(callLog).not.toContain("generation:markDispatched");
  });

  it("regenerate: requestRegenerate then dispatch regenerate with the target", async () => {
    handlers.set("generation:requestRegenerate", () => null);
    const target = { kind: "subchapter", chapterOrder: 1, subchapterOrder: 2 };
    const res = await call("regenerate", {
      jobId: "j1",
      target,
      instruction: "shorter",
    });
    expect(res.status).toBe(200);
    expect(dispatchMock).toHaveBeenCalledWith(
      { action: "regenerate", jobId: "j1", target, instruction: "shorter" },
      expect.anything(),
    );
  });

  it.each([
    ["approve", {}],
    [
      "regenerate",
      { target: { kind: "test", chapterOrder: 2 }, instruction: "harder" },
    ],
  ])(
    "%s sends the follow-up to the job's stored eve session",
    async (action, extra) => {
      handlers.set("generation:approveOutline", () => "course1");
      handlers.set("generation:requestRegenerate", () => null);
      job = { _id: "j1", status: "writing", eveSessionId: "wrun_stored" };
      const res = await call(action, { jobId: "j1", ...extra });
      expect(res.status).toBe(200);
      expect(dispatchMock).toHaveBeenCalledWith(expect.anything(), {
        sessionId: "wrun_stored",
      });
    },
  );

  it("start always opens a new session", async () => {
    handlers.set("generation:startJob", () => null);
    job = { _id: "j1", status: "researching", eveSessionId: "wrun_stale" };
    await call("start", { jobId: "j1" });
    expect(dispatchMock).toHaveBeenCalledWith(expect.anything(), {
      sessionId: undefined,
    });
  });

  it("regenerate on a published course is 409 with the published message", async () => {
    handlers.set("generation:requestRegenerate", () => {
      throw new ConvexError("BAD_STATE");
    });
    job = { _id: "j1", status: "ready", courseId: "c1" };
    const res = await call("regenerate", {
      jobId: "j1",
      target: { kind: "deck", chapterOrder: 1 },
      instruction: "",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: REGENERATE_PUBLISHED_MESSAGE,
      status: "ready",
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["researching", { action: "research", jobId: "j1" }],
    ["writing", { action: "write", jobId: "j1" }],
  ])("resume re-dispatches for %s with no transition", async (status, cmd) => {
    job = { _id: "j1", status };
    const res = await call("resume", { jobId: "j1" });
    expect(res.status).toBe(200);
    expect(dispatchMock).toHaveBeenCalledWith(cmd, expect.anything());
    expect(callLog).toEqual(["generation:get", "generation:markDispatched"]);
  });

  it("resume of a failed job: write when it has a course, else research", async () => {
    job = { _id: "j1", status: "failed", courseId: "c1" };
    await call("resume", { jobId: "j1" });
    expect(dispatchMock).toHaveBeenLastCalledWith(
      { action: "write", jobId: "j1" },
      expect.anything(),
    );
    job = { _id: "j1", status: "failed" };
    await call("resume", { jobId: "j1" });
    expect(dispatchMock).toHaveBeenLastCalledWith(
      { action: "research", jobId: "j1" },
      expect.anything(),
    );
  });

  it("resume of a queued/ready/outline_ready job is 409", async () => {
    for (const status of ["queued", "outline_ready", "ready"]) {
      job = { _id: "j1", status };
      const res = await call("resume", { jobId: "j1" });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ status });
    }
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("maps other Convex errors: FORBIDDEN 403, NOT_FOUND 404", async () => {
    handlers.set("generation:startJob", () => {
      throw new ConvexError("FORBIDDEN");
    });
    expect((await call("start", { jobId: "j1" })).status).toBe(403);
    handlers.set("generation:startJob", () => {
      throw new ConvexError("NOT_FOUND");
    });
    expect((await call("start", { jobId: "j1" })).status).toBe(404);
  });
});
