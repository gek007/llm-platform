import type { WorkflowToolContext } from "eve/tools";
import { deckDraftSchema, slideSchema, type DeckDraft } from "../../../../convex/lib/deck";
import type { EventKind } from "../../../../convex/lib/engineTypes";
import { buildDeckBrief } from "./deck-brief";
import { engineFromEnv, type ChapterContent, type JobBrief } from "./engine-client";
import { generateDeck, type DiagramCheck } from "./generate-deck";
import { engineSafe, type ToolFailure } from "./tool-result";
import { buildWriterBrief, writerOutputSchema } from "./writer-brief";

/**
 * The write fan-out shared by the `write_course` and `regenerate` workflow tools. Per chapter, all
 * chapters at once (`Promise.all` over at most MAX_CHAPTERS = 10; each chapter holds one session at
 * a time, so the fan-out stays under eve's 32-task limit; no concurrency cap, see
 * docs/features/course-engine.md):
 *
 * 1. a `chapter-writer` session writes the lessons and the test and saves them with its tools;
 * 2. the deck pipeline (lib/generate-deck.ts) asks a `deck-writer` session for the slide deck as
 *    JSON, built from the lessons just saved, validates it, retries, checks the diagrams and saves.
 *
 * A chapter that throws, fails, is cancelled or reports problems never stops the others: each run
 * settles into a `ChapterResult` or a `ChapterFailure`, and each logs one `chapter` progress event.
 *
 * Runs in a workflow body, so everything here except the `"use step"` functions must stay
 * deterministic: engine calls (network, `process.env`) and the diagram parser live in the steps.
 */

export type Saved = { subchapters: number; deck: boolean; test: boolean };
export type ChapterResult = { chapterOrder: number; saved: Saved; problems: string[] };
export type ChapterFailure = { chapterOrder: number; reason: string };
export type WriteSummary = { ok: true; chapters: ChapterResult[]; failed: ChapterFailure[] };
export type WriterRun = { ok: true; result: ChapterResult } | { ok: false; failure: ChapterFailure };

/** What the fan-out needs from the workflow context (tests pass a stub). */
export type WriteContext = Pick<WorkflowToolContext, "agent" | "abortSignal">;

/** Job statuses in which the engine accepts content saves (`failed` resumes to `writing`). */
const WRITABLE: JobBrief["status"][] = ["writing", "failed"];

/** How a deck that could not be saved reads in a chapter's `problems`. */
const DECK_PROBLEM = "Slide deck:";

/** Progress messages are capped by the engine at 2 000 characters. */
const MESSAGE_MAX = 2_000;

/** Step: load the job. An engine refusal comes back as `{ ok: false, message }` (not retried). */
export async function loadJob(jobId: string): Promise<{ ok: true; job: JobBrief } | ToolFailure> {
  "use step";
  return engineSafe(async () => ({ ok: true as const, job: await engineFromEnv().getJob({ jobId }) }));
}

/** Step: one chapter's saved content (lesson bodies, deck titles, test prompts) for a regenerate. */
export async function loadChapterContent(
  jobId: string,
  chapterOrder: number,
): Promise<{ ok: true; content: ChapterContent } | ToolFailure> {
  "use step";
  return engineSafe(async () => ({
    ok: true as const,
    content: await engineFromEnv().getChapterContent({ jobId, chapterOrder }),
  }));
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

/** Step: store a validated deck. An engine refusal comes back as `{ ok: false, message }`. */
export async function saveDeck(
  jobId: string,
  chapterOrder: number,
  deck: DeckDraft,
): Promise<{ ok: true } | ToolFailure> {
  "use step";
  return engineSafe(async () => {
    await engineFromEnv().saveDeck({ jobId, chapterOrder, title: deck.title, slides: deck.slides });
    return { ok: true as const };
  });
}

/**
 * Step: syntax-checks a deck's Mermaid diagrams with the real parser; `problems[i]` is null when
 * `codes[i]` is valid. The parser module is Node-only (jsdom), so it is imported inside the step,
 * never by the workflow body. Never throws: if the parser cannot load, the result says so and the
 * pipeline keeps the diagrams unchecked (the viewer still falls back per diagram) and reports it.
 */
export async function validateDiagrams(codes: string[]): Promise<DiagramCheck> {
  "use step";
  try {
    const { mermaidProblems } = await import("./mermaid-validate");
    return { ok: true, problems: await mermaidProblems(codes) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type DeckRun =
  | { ok: true; slides: number; attempts: number; repaired: string[]; fellBack: string[] }
  | { ok: false; reason: string };

/**
 * The deck pipeline for one chapter, wired to the real model, parser and engine: one `deck-writer`
 * session (retries and single-slide repairs continue the same conversation), built from the
 * chapter's saved lessons. `instruction` is an admin's regenerate request. Never throws.
 */
export async function runDeck(
  ctx: WriteContext,
  job: JobBrief,
  chapterOrder: number,
  instruction?: string,
): Promise<DeckRun> {
  try {
    const loaded = await loadChapterContent(job.jobId, chapterOrder);
    if (!loaded.ok) return { ok: false, reason: loaded.message };
    if (!loaded.content.lessons.some((lesson) => lesson.body.trim())) {
      return { ok: false, reason: "no lesson of the chapter is saved yet, so there is nothing to build slides from" };
    }
    const session = ctx.agent("deck-writer");
    const outcome = await generateDeck(buildDeckBrief(job, loaded.content, instruction), {
      async ask(message, expect) {
        try {
          // The schema is the turn's structured output: the model answers with JSON in that shape.
          const signal = ctx.abortSignal;
          const response =
            expect === "deck"
              ? await session.send(message, { outputSchema: deckDraftSchema, signal })
              : await session.send(message, { outputSchema: slideSchema, signal });
          const result = await response.result();
          if (result.status === "failed") return { ok: false, error: result.error.message };
          if (result.status === "cancelled") return { ok: false, error: "the deck writer was cancelled", fatal: true };
          return { ok: true, data: result.data };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      checkDiagrams: validateDiagrams,
      save: (deck) => saveDeck(job.jobId, chapterOrder, deck),
      warn: (message) => logProgress(job.jobId, "chapter", `Chapter ${chapterOrder} slides: ${message}`, chapterOrder),
    });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    const { deck, attempts, repaired, fellBack } = outcome;
    return { ok: true, slides: deck.slides.length, attempts, repaired, fellBack };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * One chapter-writer run (lessons and test): the writer brief for `chapterOrder` plus `extra` (a
 * regenerate's instruction), sent with `writerOutputSchema`. The writer never saves the deck, so
 * `saved.deck` is false here; `runChapter` fills it in. Never throws.
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
    return {
      ok: true,
      result: { chapterOrder, saved: { ...report.data.saved, deck: false }, problems: report.data.problems },
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export type ChapterOptions = {
  /** Appended to the writer brief (a whole-chapter regenerate's instruction). */
  extra?: string;
  /** The admin's regenerate instruction, for the deck brief. */
  deckInstruction?: string;
};

/**
 * One chapter, in order: the lessons and the test (chapter-writer), then the slide deck built from
 * the saved lessons (deck pipeline). When the lessons and the test are already saved and only the
 * deck is missing (a repeated or resumed write), the writer is skipped and only the deck is made.
 * A deck that could not be saved is a problem of the chapter, not a failed run: the lessons and the
 * test stay saved and the chapter is reported as incomplete.
 */
export async function runChapter(
  ctx: WriteContext,
  job: JobBrief,
  chapterOrder: number,
  options: ChapterOptions = {},
): Promise<WriterRun> {
  const chapter = job.course?.chapters.find((c) => c.order === chapterOrder);
  const onlyDeckMissing =
    options.extra === undefined &&
    !!chapter &&
    chapter.hasTest &&
    !chapter.hasDeck &&
    chapter.subchapters.length > 0 &&
    chapter.subchapters.every((s) => s.hasBody);
  const run: WriterRun = onlyDeckMissing
    ? {
        ok: true,
        result: { chapterOrder, saved: { subchapters: chapter.subchapters.length, deck: false, test: true }, problems: [] },
      }
    : await runWriter(ctx, job, chapterOrder, options.extra);
  if (!run.ok) return run;
  const deck = await runDeck(ctx, job, chapterOrder, options.deckInstruction);
  return {
    ok: true,
    result: {
      chapterOrder,
      saved: { ...run.result.saved, deck: deck.ok },
      problems: deck.ok ? run.result.problems : [...run.result.problems, `${DECK_PROBLEM} ${deck.reason}`],
    },
  };
}

/** Why a completed full-chapter run still leaves the chapter unfinished, or null when it is done. */
export function incompleteReason(job: JobBrief, result: ChapterResult): string | null {
  const planned = job.course?.chapters.find((c) => c.order === result.chapterOrder)?.subchapters.length ?? 0;
  const gaps: string[] = [];
  if (result.saved.subchapters < planned) gaps.push(`${result.saved.subchapters} of ${planned} subchapters saved`);
  // A deck the pipeline could not save already names its reason in `problems`.
  if (!result.saved.deck && !result.problems.some((p) => p.startsWith(DECK_PROBLEM))) gaps.push("slide deck not saved");
  if (!result.saved.test) gaps.push("test not saved");
  gaps.push(...result.problems);
  return gaps.length > 0 ? gaps.join("; ") : null;
}

/**
 * Reads a `finishJob` refusal ("INCOMPLETE: Chapter 2: deck missing; Chapter 3: lesson "x" has no
 * body"): one line per gap, and the chapters named in it (sorted, unique) to write again. The
 * number is read only at a gap's start, and a lesson gap runs to its closing `" has no body`, so a
 * lesson title containing "; " or "Chapter 9:" neither splits a gap nor adds a chapter.
 */
export function missingFromRefusal(message: string): { missing: string[]; chapterOrders: number[] } {
  const detail = message.replace(/^[A-Z_]+:\s*/, "");
  const missing: string[] = [];
  const orders: number[] = [];
  let rest = detail;
  while (rest.trim() !== "") {
    const head = /^Chapter (\d+): /.exec(rest);
    let end = -1;
    if (head && rest.startsWith('lesson "', head[0].length)) {
      const close = rest.indexOf('" has no body', head[0].length);
      if (close >= 0) end = close + '" has no body'.length;
    }
    if (end < 0) end = rest.includes("; ") ? rest.indexOf("; ") : rest.length;
    missing.push(rest.slice(0, end).trim());
    if (head) orders.push(Number(head[1]));
    rest = rest.slice(end).replace(/^; /, "");
  }
  return { missing: missing.filter(Boolean), chapterOrders: [...new Set(orders)].sort((a, b) => a - b) };
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
  options: ChapterOptions = {},
): Promise<WriteSummary> {
  const runs = await Promise.all(
    chapterOrders.map(async (chapterOrder) => {
      const run = await runChapter(ctx, job, chapterOrder, options);
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
