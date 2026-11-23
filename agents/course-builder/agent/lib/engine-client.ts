import type { FunctionArgs } from "convex/server";
import type { internal } from "../../../../convex/_generated/api";
import type { ChapterContent, JobBrief } from "../../../../convex/lib/engineTypes";
import { convexSiteUrl, createEngineHttp, EngineError } from "../../../../src/lib/course-builder/engine-http";

/**
 * Typed client for the Convex `/engine/*` HTTP API (convex/http.ts), the agent's only memory and
 * only way to write. One method per op, same names; arguments are exactly the op's validator
 * (convex/engine.ts). A failed call throws `EngineError` whose message is the server's whole
 * `error` string ("CODE: detail", or "Unknown reference: <ref>") so the model can fix and retry.
 * Holds `COURSE_ENGINE_SECRET`; never logs it.
 */

export { EngineError };
export type { ChapterContent, JobBrief };

type Ops = typeof internal.engine;
type Args<K extends keyof Ops> = FunctionArgs<Ops[K]>;

export type EngineClient = {
  getJob(args: Args<"getJob">): Promise<JobBrief>;
  getChapterContent(args: Args<"getChapterContent">): Promise<ChapterContent>;
  setResourceStatus(args: Args<"setResourceStatus">): Promise<void>;
  saveSources(args: Args<"saveSources">): Promise<{ sources: { id: string; url: string }[] }>;
  saveOutline(args: Args<"saveOutline">): Promise<void>;
  reportProgress(args: Args<"reportProgress">): Promise<void>;
  saveSubchapter(args: Args<"saveSubchapter">): Promise<{ lessonId: string }>;
  saveDeck(args: Args<"saveDeck">): Promise<{ deckId: string }>;
  saveTest(args: Args<"saveTest">): Promise<{ testId: string; version: number }>;
  finishJob(args: Args<"finishJob">): Promise<void>;
  failJob(args: Args<"failJob">): Promise<void>;
};

export function createEngineClient(options: {
  baseUrl: string;
  secret: string;
  fetch?: typeof fetch;
}): EngineClient {
  const http = createEngineHttp(options);
  // The server answers `{ ok: true, ...result }`; callers get the result alone.
  const call = async <T>(op: keyof EngineClient, args: unknown): Promise<T> => {
    const { ok, ...result } = (await http(op, args)) as { ok: true } & Record<string, unknown>;
    void ok;
    return result as T;
  };
  const none = async (op: keyof EngineClient, args: unknown) => {
    await call(op, args);
  };
  return {
    getJob: (args) => call("getJob", args),
    getChapterContent: (args) => call("getChapterContent", args),
    setResourceStatus: (args) => none("setResourceStatus", args),
    saveSources: (args) => call("saveSources", args),
    saveOutline: (args) => none("saveOutline", args),
    reportProgress: (args) => none("reportProgress", args),
    saveSubchapter: (args) => call("saveSubchapter", args),
    saveDeck: (args) => call("saveDeck", args),
    saveTest: (args) => call("saveTest", args),
    finishJob: (args) => none("finishJob", args),
    failJob: (args) => none("failJob", args),
  };
}

/** The agent's client: Convex site URL from the environment (see `convexSiteUrl`) and `COURSE_ENGINE_SECRET`. */
export function engineFromEnv(): EngineClient {
  const baseUrl = convexSiteUrl();
  const secret = process.env.COURSE_ENGINE_SECRET ?? "";
  if (!baseUrl || !secret) {
    throw new Error(
      "Course engine is not configured: set COURSE_ENGINE_SECRET and CONVEX_SITE_URL (or NEXT_PUBLIC_CONVEX_URL)",
    );
  }
  return createEngineClient({ baseUrl, secret });
}
