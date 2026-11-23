import type { EngineCommand } from "./commands";
import { runFakeEngine } from "./fake-engine";

export type DispatchResult = { sessionId: string };

/** `fake` runs the canned engine; anything else (default) is `live`. */
export function engineMode(): "fake" | "live" {
  return process.env.COURSE_ENGINE_MODE === "fake" ? "fake" : "live";
}

/** Task 17 fills this in: send `commandMessage(cmd)` to the course-builder agent session. */
async function sendToAgent(
  cmd: EngineCommand,
  opts: { sessionId?: string },
): Promise<DispatchResult> {
  void cmd;
  void opts;
  throw new Error("course-builder agent not configured");
}

/**
 * Hands a command to the engine. Fake mode runs the whole phase in this call (no eve, no session
 * reuse) and returns `fake-<jobId>`; live mode sends it to the agent.
 */
export async function dispatch(
  cmd: EngineCommand,
  opts: { sessionId?: string } = {},
): Promise<DispatchResult> {
  if (engineMode() === "fake") return await runFakeEngine(cmd);
  return await sendToAgent(cmd, opts);
}
