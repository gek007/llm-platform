import { afterEach, describe, expect, it, vi } from "vitest";

const runFakeEngine = vi.fn();
vi.mock("./fake-engine", () => ({
  runFakeEngine: (...a: unknown[]) => runFakeEngine(...a),
}));
vi.mock("./engine-http", () => ({ engineHttp: vi.fn() }));
const sendToAgent = vi.fn();
vi.mock("./eve-client", () => ({
  sendToAgent: (...a: unknown[]) => sendToAgent(...a),
}));

import { dispatch } from "./dispatch";

afterEach(() => {
  vi.unstubAllEnvs();
  runFakeEngine.mockReset();
  sendToAgent.mockReset();
});

describe("dispatch", () => {
  it("fake mode runs the fake engine and returns its session", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "fake");
    runFakeEngine.mockResolvedValue({ sessionId: "fake-j1" });
    const cmd = { action: "research", jobId: "j1" } as const;
    await expect(dispatch(cmd)).resolves.toEqual({ sessionId: "fake-j1" });
    expect(runFakeEngine).toHaveBeenCalledWith(cmd);
  });

  it("defaults to live, which sends the command to the agent's stored session", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "");
    sendToAgent.mockResolvedValue({ sessionId: "wrun_1" });
    const cmd = { action: "write", jobId: "j1" } as const;
    await expect(dispatch(cmd, { sessionId: "wrun_1" })).resolves.toEqual({
      sessionId: "wrun_1",
    });
    expect(sendToAgent).toHaveBeenCalledWith(cmd, "wrun_1");
    expect(runFakeEngine).not.toHaveBeenCalled();
  });

  it("live without a stored session starts a new one", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "live");
    sendToAgent.mockResolvedValue({ sessionId: "wrun_2" });
    await dispatch({ action: "research", jobId: "j1" });
    expect(sendToAgent).toHaveBeenCalledWith(
      { action: "research", jobId: "j1" },
      undefined,
    );
  });

  it("live ignores a session id left by fake mode", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "live");
    sendToAgent.mockResolvedValue({ sessionId: "wrun_3" });
    await dispatch({ action: "write", jobId: "j1" }, { sessionId: "fake-j1" });
    expect(sendToAgent).toHaveBeenCalledWith(
      { action: "write", jobId: "j1" },
      undefined,
    );
  });
});
