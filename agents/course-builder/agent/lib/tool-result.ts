import { EngineError } from "./engine-client";

/** What a tool returns instead of throwing when the engine refuses a call. */
export type ToolFailure = { ok: false; message: string };

/**
 * Runs a tool body and turns an `EngineError` into `{ ok: false, message }`, where `message` is the
 * engine's whole "CODE: detail" string, so the model can read it, fix its input and retry. Any
 * other error (engine not configured, network down) still throws and fails the call.
 */
export async function engineSafe<T>(body: () => Promise<T>): Promise<T | ToolFailure> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof EngineError) return { ok: false, message: err.message };
    throw err;
  }
}
