import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  MAX_CHAPTERS,
  MAX_SUBCHAPTERS,
  type eventKindValidator,
  type JobStatus,
  type Outline,
} from "./engineTypes";

/** Shared by the admin API (generation.ts) and the engine API (engine.ts). */
export type JobCtx = Pick<MutationCtx, "db">;
export type EventKind = Infer<typeof eventKindValidator>;

export async function logEvent(
  ctx: JobCtx,
  jobId: Id<"generationJobs">,
  kind: EventKind,
  message: string,
  chapterOrder?: number,
) {
  await ctx.db.insert("generationEvents", { jobId, at: Date.now(), kind, message, chapterOrder });
}

/**
 * Guarded status change: throws BAD_STATE unless the job is in one of `from`; stamps updatedAt,
 * applies `patch` and logs an event.
 */
export async function transition(
  ctx: JobCtx,
  job: Doc<"generationJobs">,
  from: JobStatus[],
  to: JobStatus,
  patch: Partial<Pick<Doc<"generationJobs">, "error">> = {},
) {
  if (!from.includes(job.status)) throw new ConvexError("BAD_STATE");
  await ctx.db.patch(job._id, { ...patch, status: to, updatedAt: Date.now() });
  await logEvent(ctx, job._id, "info", `Status: ${job.status} -> ${to}`);
}

/** Hard caps for any outline (admin edit or engine save): 1..MAX chapters, 1..MAX subchapters each. */
export function validateOutline(outline: Outline) {
  if (outline.chapters.length < 1 || outline.chapters.length > MAX_CHAPTERS)
    throw new ConvexError("INVALID_OUTLINE");
  for (const ch of outline.chapters) {
    if (ch.subchapters.length < 1 || ch.subchapters.length > MAX_SUBCHAPTERS)
      throw new ConvexError("INVALID_OUTLINE");
  }
}
