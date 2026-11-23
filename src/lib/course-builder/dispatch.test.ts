import { afterEach, describe, expect, it, vi } from "vitest";

const runFakeEngine = vi.fn();
vi.mock("./fake-engine", () => ({
  runFakeEngine: (...a: unknown[]) => runFakeEngine(...a),
}));
vi.mock("./engine-http", () => ({ engineHttp: vi.fn() }));

import { dispatch } from "./dispatch";

afterEach(() => {
  vi.unstubAllEnvs();
  runFakeEngine.mockReset();
});

describe("dispatch", () => {
  it("fake mode runs the fake engine and returns its session", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "fake");
    runFakeEngine.mockResolvedValue({ sessionId: "fake-j1" });
    const cmd = { action: "research", jobId: "j1" } as const;
    await expect(dispatch(cmd)).resolves.toEqual({ sessionId: "fake-j1" });
    expect(runFakeEngine).toHaveBeenCalledWith(cmd);
  });

  it("defaults to live, which is not configured yet", async () => {
    vi.stubEnv("COURSE_ENGINE_MODE", "");
    await expect(dispatch({ action: "write", jobId: "j1" })).rejects.toThrow(
      "course-builder agent not configured",
    );
    expect(runFakeEngine).not.toHaveBeenCalled();
  });
});
