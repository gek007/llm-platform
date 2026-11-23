import type { WorkflowToolContext } from "eve/tools";
import type { EventKind } from "../../../../convex/lib/engineTypes";
import { engineFromEnv, type JobBrief } from "./engine-client";
import { engineSafe, type ToolFailure } from "./tool-result";
import { buildWriterBrief, writerOutputSchema, type WriterOutput } from "./writer-brief";

/**
 * The write fan-out shared by the `write_course` and `regenerate` workflow tools: one
 * `chapter-writer` session per chapter, all started at once (`Promise.all` over at most
 * MAX_CHAPTERS = 10, under eve's 32-task limit; no concurrency cap, see docs/features/course-engine.md).
 * A writer that throws, fails, is cancelled or reports problems never stops the others: each run
 * settles into a `ChapterResult` or a `ChapterFailure`, and each logs one `chapter` progress event.
 *
 * Runs in a workflow body, so everything here except the `"use step"` functions must stay
 * deterministic: engine calls (network, `process.env`) live in the steps.
 */

export type ChapterResult = { chapterOrder: number; saved: WriterOutput["saved"]; problems: string[] };
export type ChapterFailure = { chapterOrder: number; reason: string };
export type WriteSummary = { ok: true; chapters: ChapterResult[]; failed: ChapterFailure[] };
export type WriterRun = { ok: true; result: ChapterResult } | { ok: false; failure: ChapterFailure };

/** What the fan-out needs from the workflow context (tests pass a stub). */
export type WriteContext = Pick<WorkflowToolContext, "agent" | "abortSignal">;

/** Job statuses in which the engine accepts content saves (`failed` resumes to `writing`). */
const WRITABLE: JobBrief["status"][] = ["writing", "failed"];

/** Progress messages are capped by the engine at 2 000 characters. */
const MESSAGE_MAX = 2_000;

/** Step: load the job. An engine refusal comes back as `{ ok: false, message }` (not retried). */
export async function loadJob(jobId: string): Promise<{ ok: true; job: JobBrief } | ToolFailure> {
  "use step";
  return engineSafe(async () => ({ ok: true as const, job: await engineFromEnv().getJob({ jobId }) }));
}

/** Step: log a progress event. Never throws: a lost progress line must not stop the writers. */
export async function logProgress(
  jobId: string,
  kind: EventKind,
  message: string,
  chapterOrder?: number,
): Promise<boolean> {
  "use step";
  try {
    const text = message.length > MESSAGE_MAX ? `${message.slice(0, MESSAGE_MAX - 1)}…` : message;
    await engineFromEnv().reportProgress({ jobId, kind, message: text, chapterOrder });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks that the job can take content and that every requested chapter exists. Returns the
 * chapter orders to write (all chapters when `chapterOrders` is omitted), or the refusal.
 */
export function chaptersToWrite(job: JobBrief, chapterOrders?: number[]): { ok: true; orders: number[] } | ToolFailure {
  if (!WRITABLE.includes(job.status)) {
    return {
      ok: false,
      message: `BAD_STATE: the job is ${job.status}; chapters can be written only while it is writing`,
    };
  }
  const all = (job.course?.chapters ?? []).map((c) => c.order);
  if (all.length === 0) return { ok: false, message: "BAD_STATE: the job has no course yet (the outline is not approved)" };
  const orders = chapterOrders ? [...new Set(chapterOrders)].sort((a, b) => a - b) : all;
  const unknown = orders.filter((n) => !all.includes(n));
  if (unknown.length > 0) {
    return {
      ok: false,
      message: `INVALID: the course has no chapter ${unknown.join(", ")} (its chapters are ${all.join(", ")})`,
    };
  }
  return { ok: true, orders };
}

/**
 * One chapter-writer run: the writer brief for `chapterOrder` plus `extra` (a regenerate's
 * instruction), sent with `writerOutputSchema`. Never throws.
 */
export async function runWriter(
  ctx: WriteContext,
  job: JobBrief,
  chapterOrder: number,
  extra?: string,
): Promise<WriterRun> {
  const fail = (reason: string): WriterRun => ({ ok: false, failure: { chapterOrder, reason } });
  try {
    const brief = buildWriterBrief(job, chapterOrder);
    const message = extra ? `${brief}\n\n${extra}` : brief;
    const response = await ctx.agent("chapter-writer").send(message, {
      outputSchema: writerOutputSchema,
      signal: ctx.abortSignal,
    });
    const result = await response.result();
    if (result.status === "failed") return fail(`the writer failed: ${result.error.message}`);
    if (result.status === "cancelled") return fail("the writer was cancelled");
    const report = writerOutputSchema.safeParse(result.data);
    if (!report.success) return fail("the writer returned no valid report");
    return { ok: true, result: { chapterOrder, saved: report.data.saved, problems: report.data.problems } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Why a completed full-chapter run still leaves the chapter unfinished, or null when it is done. */
export function incompleteReason(job: JobBrief, result: ChapterResult): string | null {
  const planned = job.course?.chapters.find((c) => c.order === result.chapterOrder)?.subchapters.length ?? 0;
  const gaps: string[] = [];
  if (result.saved.subchapters < planned) gaps.push(`${result.saved.subchapters} of ${planned} subchapters saved`);
  if (!result.saved.deck) gaps.push("slide deck not saved");
  if (!result.saved.test) gaps.push("test not saved");
  gaps.push(...result.problems);
  return gaps.length > 0 ? gaps.join("; ") : null;
}

/**
 * Reads a `finishJob` refusal ("INCOMPLETE: Chapter 2: deck missing; Chapter 3: lesson "x" has no
 * body"): one line per gap, and the chapters named in it (sorted, unique) to write again.
 */
export function missingFromRefusal(message: string): { missing: string[]; chapterOrders: number[] } {
  const detail = message.replace(/^[A-Z_]+:\s*/, "");
  const orders = [...detail.matchAll(/\bChapter (\d+):/g)].map((m) => Number(m[1]));
  return {
    missing: detail.split("; ").filter((line) => line.trim() !== ""),
    chapterOrders: [...new Set(orders)].sort((a, b) => a - b),
  };
}

/** The progress line for one finished full-chapter run. */
function chapterMessage(run: WriterRun, reason: string | null): string {
  if (!run.ok) return `Chapter ${run.failure.chapterOrder} failed: ${run.failure.reason}`;
  const { chapterOrder, saved } = run.result;
  if (reason) return `Chapter ${chapterOrder} is incomplete: ${reason}`;
  return `Chapter ${chapterOrder} written: ${saved.subchapters} subchapters, slide deck and test saved`;
}

/**
 * Writes the given chapters in parallel and reports one `chapter` event per finished run. `failed`
 * lists every chapter that still needs work (the run failed, or its report shows problems or
 * missing items), so the agent can write those chapters again.
 */
export async function writeChapters(
  ctx: WriteContext,
  job: JobBrief,
  chapterOrders: number[],
  extra?: string,
): Promise<WriteSummary> {
  const runs = await Promise.all(
    chapterOrders.map(async (chapterOrder) => {
      const run = await runWriter(ctx, job, chapterOrder, extra);
      const reason = run.ok ? incompleteReason(job, run.result) : run.failure.reason;
      await logProgress(job.jobId, "chapter", chapterMessage(run, run.ok ? reason : null), chapterOrder);
      return { run, reason };
    }),
  );
  const chapters: ChapterResult[] = [];
  const failed: ChapterFailure[] = [];
  for (const { run, reason } of runs) {
    if (run.ok) chapters.push(run.result);
    if (reason !== null) failed.push({ chapterOrder: run.ok ? run.result.chapterOrder : run.failure.chapterOrder, reason });
  }
  return { ok: true, chapters, failed };
}
