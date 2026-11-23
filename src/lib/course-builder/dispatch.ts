import type { EngineCommand } from "./commands";
import { sendToAgent } from "./eve-client";
import { runFakeEngine } from "./fake-engine";

export type DispatchResult = { sessionId: string };

/** `fake` runs the canned engine; anything else (default) is `live`. */
export function engineMode(): "fake" | "live" {
  return process.env.COURSE_ENGINE_MODE === "fake" ? "fake" : "live";
}

/**
 * Hands a command to the engine. Fake mode runs the whole phase in this call (no eve, no session
 * reuse) and returns `fake-<jobId>`; live mode sends it to the course-builder agent, as a
 * follow-up to `sessionId` (the job's stored `eveSessionId`) when given, else in a new session.
 */
export async function dispatch(
  cmd: EngineCommand,
  opts: { sessionId?: string } = {},
): Promise<DispatchResult> {
  if (engineMode() === "fake") return await runFakeEngine(cmd);
  // A `fake-<jobId>` id (left by fake mode) was never an eve session.
  const sessionId = opts.sessionId?.startsWith("fake-")
    ? undefined
    : opts.sessionId;
  return await sendToAgent(cmd, sessionId);
}
