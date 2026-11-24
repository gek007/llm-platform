// @vitest-environment node
import type { WorkflowToolContext } from "eve/tools";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { deckDraftSchema, slideSchema, type DeckDraft } from "../../../../convex/lib/deck";
import type { JobBrief } from "../../../../convex/lib/engineTypes";
import { fakeDeck } from "../../../../src/lib/course-builder/fake-deck";
import { buildDeckBrief } from "../lib/deck-brief";
import { EngineError, type EngineClient } from "../lib/engine-client";
import { buildWriterBrief, writerOutputSchema, type WriterOutput } from "../lib/writer-brief";

// Fake engine: every op is a spy; tests set what getJob returns or make finishJob refuse.
const engine = {
  getJob: vi.fn(),
  reportProgress: vi.fn<(args: unknown) => Promise<void>>(async () => {}),
  finishJob: vi.fn(async () => {}),
  failJob: vi.fn<(args: unknown) => Promise<void>>(async () => {}),
  getChapterContent: vi.fn(),
  saveDeck: vi.fn<(args: unknown) => Promise<{ deckId: string }>>(async () => ({ deckId: "deck1" })),
};
vi.mock("../lib/engine-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/engine-client")>()),
  engineFromEnv: () => engine as unknown as EngineClient,
}));

import { missingFromRefusal } from "../lib/write-chapters";
import failJob from "./fail_job";
import finishJob from "./finish_job";
import regenerate from "./regenerate";
import writeCourse from "./write_course";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Failed = { status: "failed"; message: string };
type Outcome = WriterOutput | Error | Failed;
type Send = { name: string; message: string; options: any; chapterOrder: number };

const isFailed = (out: unknown): out is Failed =>
  typeof out === "object" && out !== null && (out as Failed).status === "failed";

/** A deck the pipeline accepts: the fake engine's canned deck (10 slides, 4 visuals, valid diagram). */
const goodDeck = (): DeckDraft => ({ title: "Deck title", slides: fakeDeck("Deck title") });
/** A deck the schema refuses (6 slides). */
const badDeck = (): DeckDraft => ({ title: "Deck title", slides: fakeDeck("Deck title").slice(0, 6) });

/**
 * A stubbed `ctx.agent`: every `send` is recorded, and its result waits until the test releases
 * it, so a test can check that all writers started before any finished.
 * - `outcome(chapterOrder)` decides what each chapter writer answers (default: everything saved);
 *   those sends land in `sends`.
 * - `deckAnswer(chapterOrder, turn)` is what the deck writer returns on each turn of its
 *   conversation (default: a valid deck); those sends land in `deckSends`.
 */
function stubAgents(
  outcome: (chapterOrder: number) => Outcome = (n) => report(n),
  deckAnswer: (chapterOrder: number, turn: number) => unknown = () => goodDeck(),
) {
  const sends: Send[] = [];
  const deckSends: Send[] = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const settled = (out: unknown) => ({
    async result() {
      await released;
      if (isFailed(out)) return { status: "failed", error: { message: out.message } };
      return { status: "completed", data: out };
    },
  });
  const ctx = {
    abortSignal: new AbortController().signal,
    agents: {},
    agent: vi.fn((name: string) => {
      // One session per ctx.agent() call: a deck writer's retries continue its conversation.
      let chapterOrder = NaN;
      let turn = 0;
      return {
        async send(message: string, options: any) {
          if (name === "deck-writer") {
            chapterOrder = Number(/^# Slide deck for chapter (\d+)/.exec(message)?.[1] ?? chapterOrder);
            deckSends.push({ name, message, options, chapterOrder });
            const out = deckAnswer(chapterOrder, turn++);
            if (out instanceof Error) throw out;
            return settled(out);
          }
          chapterOrder = Number(/^# Write chapter (\d+)/.exec(message)?.[1]);
          sends.push({ name, message, options, chapterOrder });
          const out = outcome(chapterOrder);
          if (out instanceof Error) throw out;
          return settled(out);
        },
      };
    }),
  };
  return { ctx: ctx as unknown as WorkflowToolContext, sends, deckSends, release };
}

/** What a chapter writer reports when it saved everything it is responsible for. */
const report = (chapterOrder: number, subchapters = 2): WriterOutput => ({
  chapterOrder,
  saved: { subchapters, test: true },
  problems: [],
});

/** A chapter's result when the writer saved its lessons and test and the deck pipeline its deck. */
const full = (chapterOrder: number, subchapters = 2) => ({
  chapterOrder,
  saved: { subchapters, deck: true, test: true },
  problems: [] as string[],
});

const chapter = (order: number) => ({
  order,
  title: `Chapter ${order} title`,
  summary: `Goal of chapter ${order}`,
  subchapters: [1, 2].map((s) => ({ order: s, title: `Lesson ${order}.${s}`, summary: `Goal ${order}.${s}`, hasBody: false })),
  hasDeck: false,
  hasTest: false,
});

function job(over: Partial<JobBrief> = {}): JobBrief {
  return {
    jobId: "job1",
    status: "writing",
    topic: "Basics of personal budgeting",
    language: "en",
    level: "beginner",
    length: "short",
    resources: [],
    sources: [],
    course: { courseId: "course1", chapters: [chapter(1), chapter(2), chapter(3)] },
    ...over,
  };
}

const execute = (tool: { execute: (input: never, ctx: WorkflowToolContext) => unknown }, input: unknown, ctx: WorkflowToolContext) =>
  tool.execute(input as never, ctx) as Promise<Record<string, any>>;

/** Lets pending promise callbacks run (the writers start inside the tool's async body). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const chapterEvents = () =>
  engine.reportProgress.mock.calls
    .map(([args]) => args as { kind: string; chapterOrder?: number; message: string })
    .filter((e) => e.kind === "chapter");

/** What getChapterContent returns for a chapter (saved bodies the deck and regenerate briefs carry). */
const content = (chapterOrder: number) => ({
  chapterOrder,
  title: `Chapter ${chapterOrder} title`,
  lessons: [
    { order: 1, title: `Lesson ${chapterOrder}.1`, body: `BODY-${chapterOrder}.1 envelopes and percentages`, truncated: false },
    { order: 2, title: `Lesson ${chapterOrder}.2`, body: `BODY-${chapterOrder}.2 review monthly`, truncated: true },
  ],
  deckSlideTitles: ["Why budget", "Envelopes"],
  testPrompts: ["What is a fixed cost?"],
});

beforeEach(() => {
  vi.clearAllMocks();
  engine.getJob.mockResolvedValue(job());
  engine.getChapterContent.mockImplementation(async ({ chapterOrder }: { chapterOrder: number }) => content(chapterOrder));
});

describe("write_course", () => {
  test("3 chapters → 3 chapter-writer sends, all started before any finishes; then one deck per chapter", async () => {
    const { ctx, sends, deckSends, release } = stubAgents();
    const pending = execute(writeCourse, { jobId: "job1" }, ctx);
    await settle();
    // Every writer is already running while none has answered: the fan-out is parallel.
    expect(sends).toHaveLength(3);
    // No deck is asked for before its chapter's lessons are saved.
    expect(deckSends).toHaveLength(0);
    release();
    const out = await pending;

    expect(engine.getJob).toHaveBeenCalledWith({ jobId: "job1" });
    expect(ctx.agent).toHaveBeenCalledTimes(6); // a chapter writer and a deck writer per chapter
    expect(sends.map((s) => s.name)).toEqual(["chapter-writer", "chapter-writer", "chapter-writer"]);
    for (const n of [1, 2, 3]) {
      const send = sends.find((s) => s.message === buildWriterBrief(job(), n));
      expect(send?.options).toEqual({ outputSchema: writerOutputSchema, signal: ctx.abortSignal });
    }
    expect(out).toEqual({ ok: true, chapters: [full(1), full(2), full(3)], failed: [] });
    // The first write sends plain writer briefs: no saved content in them.
    for (const send of sends) expect(send.message).not.toContain("BODY-");
    // One chapter event per finished chapter.
    expect(chapterEvents().map((e) => e.chapterOrder).sort()).toEqual([1, 2, 3]);
    expect(chapterEvents()[0]?.message).toMatch(/written: 2 subchapters, slide deck and test saved/);
  });

  test("each deck is one structured-output call, built from the chapter's saved lessons, then saved", async () => {
    const { ctx, deckSends, release } = stubAgents();
    release();
    await execute(writeCourse, { jobId: "job1" }, ctx);

    expect(deckSends.map((s) => s.chapterOrder).sort()).toEqual([1, 2, 3]); // one call per chapter
    for (const n of [1, 2, 3]) {
      expect(engine.getChapterContent).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: n });
      const send = deckSends.find((s) => s.chapterOrder === n)!;
      expect(send.name).toBe("deck-writer");
      expect(send.message).toBe(buildDeckBrief(job(), content(n)));
      expect(send.message).toContain(`BODY-${n}.1 envelopes and percentages`);
      // The deck schema is the turn's output schema: the model answers with JSON, never markup.
      expect(send.options).toEqual({ outputSchema: deckDraftSchema, signal: ctx.abortSignal });
      expect(engine.saveDeck).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: n, ...goodDeck() });
    }
    expect(engine.saveDeck).toHaveBeenCalledTimes(3);
  });

  test("chapterOrders: [2] → exactly one send, with chapter 2's brief", async () => {
    const { ctx, sends, release } = stubAgents();
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [2] }, ctx);

    expect(sends).toHaveLength(1);
    expect(sends[0]?.message).toBe(buildWriterBrief(job(), 2));
    expect(out).toEqual({ ok: true, chapters: [full(2)], failed: [] });
    expect(chapterEvents()).toEqual([expect.objectContaining({ chapterOrder: 2, jobId: "job1" })]);
  });

  test("a writer reporting problems and a writer that throws do not stop the others", async () => {
    const { ctx, sends, deckSends, release } = stubAgents((n) =>
      n === 1
        ? { chapterOrder: 1, saved: { subchapters: 2, test: false }, problems: ["Test: INVALID: duplicate ids"] }
        : n === 2
          ? new Error("child session crashed")
          : report(n),
    );
    release();
    const out = await execute(writeCourse, { jobId: "job1" }, ctx);

    expect(sends).toHaveLength(3);
    expect(out.ok).toBe(true);
    // Chapter 3 saved; chapter 1's report is kept; chapter 2 has no report.
    expect(out.chapters).toEqual([
      { chapterOrder: 1, saved: { subchapters: 2, deck: true, test: false }, problems: ["Test: INVALID: duplicate ids"] },
      full(3),
    ]);
    expect(out.failed).toEqual([
      { chapterOrder: 1, reason: "test not saved; Test: INVALID: duplicate ids" },
      { chapterOrder: 2, reason: "child session crashed" },
    ]);
    // A chapter whose writer failed has no lessons to build slides from: no deck is asked for.
    expect(deckSends.map((s) => s.chapterOrder).sort()).toEqual([1, 3]);
    const events = chapterEvents();
    expect(events.map((e) => e.chapterOrder).sort()).toEqual([1, 2, 3]);
    expect(events.find((e) => e.chapterOrder === 2)?.message).toBe("Chapter 2 failed: child session crashed");
    expect(events.find((e) => e.chapterOrder === 1)?.message).toMatch(/^Chapter 1 is incomplete: test not saved/);
  });

  test("a failed writer turn and a missing subchapter both land in failed", async () => {
    const { ctx, release } = stubAgents((n) =>
      n === 1 ? { status: "failed", message: "model overloaded" } : n === 2 ? report(2, 1) : report(n),
    );
    release();
    const out = await execute(writeCourse, { jobId: "job1" }, ctx);
    expect(out.failed).toEqual([
      { chapterOrder: 1, reason: "the writer failed: model overloaded" },
      { chapterOrder: 2, reason: "1 of 2 subchapters saved" },
    ]);
  });

  test("an invalid deck is retried in the same conversation with the errors fed back", async () => {
    const { ctx, deckSends, release } = stubAgents(undefined, (n, turn) => (n === 2 && turn === 0 ? badDeck() : goodDeck()));
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [2] }, ctx);

    expect(ctx.agent).toHaveBeenCalledTimes(2); // one chapter writer, one deck writer: the retry reuses its session
    expect(deckSends).toHaveLength(2);
    expect(deckSends[1].message).toMatch(/^Your deck did not pass validation\./);
    expect(deckSends[1].message).toMatch(/- slides: /);
    expect(deckSends[1].options).toEqual({ outputSchema: deckDraftSchema, signal: ctx.abortSignal });
    expect(engine.saveDeck).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: true, chapters: [full(2)], failed: [] });
  });

  test("a deck that stays invalid leaves the chapter incomplete; its lessons and test stay saved", async () => {
    const { ctx, deckSends, release } = stubAgents(undefined, (n) => (n === 2 ? badDeck() : goodDeck()));
    release();
    const out = await execute(writeCourse, { jobId: "job1" }, ctx);

    expect(deckSends.filter((s) => s.chapterOrder === 2)).toHaveLength(3); // the first answer and 2 retries
    expect(out.chapters).toHaveLength(3);
    const reason = out.chapters[1].problems[0] as string;
    expect(reason).toMatch(/^Slide deck: the deck was not accepted after 2 retries: .*slides: Too small: expected array to have >=8 items/);
    expect(out.chapters[1]).toEqual({ chapterOrder: 2, saved: { subchapters: 2, deck: false, test: true }, problems: [reason] });
    expect(out.failed).toEqual([{ chapterOrder: 2, reason }]);
    expect(engine.saveDeck).toHaveBeenCalledTimes(2); // chapters 1 and 3
    expect(chapterEvents().find((e) => e.chapterOrder === 2)?.message).toBe(`Chapter 2 is incomplete: ${reason}`);
  });

  test("a broken diagram is repaired with a single-slide call; if that fails the slide falls back to bullets", async () => {
    const broken = goodDeck();
    broken.slides[2] = { ...broken.slides[2], visual: { type: "mermaid", code: "flowchart LR\n  A[Ask --> B{Answer" } };
    const { ctx, deckSends, release } = stubAgents(undefined, (_n, turn) => (turn === 0 ? broken : broken.slides[2]));
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [1] }, ctx);

    expect(deckSends).toHaveLength(2);
    expect(deckSends[1].message).toMatch(/^The Mermaid diagram on slide "s3" .* is not valid:\n\nmermaid: Parse error/);
    // The repair asks for one slide, with the slide schema as the output schema.
    expect(deckSends[1].options).toEqual({ outputSchema: slideSchema, signal: ctx.abortSignal });
    const saved = engine.saveDeck.mock.calls[0][0] as { slides: DeckDraft["slides"] };
    expect(saved.slides[2]).toMatchObject({ id: "s3", layout: "bullets" });
    expect(saved.slides[2].visual).toBeUndefined();
    expect(out).toEqual({ ok: true, chapters: [full(1)], failed: [] });
    // The admin is told about the fallback in the chapter's activity.
    expect(chapterEvents().map((e) => e.message)).toContainEqual(
      expect.stringMatching(/^Chapter 1 slides: The diagram on slide "s3" .* was replaced with bullets/),
    );
  });

  test("only the deck missing (a resumed write): the chapter writer is skipped", async () => {
    const written = { ...chapter(2), hasTest: true, subchapters: chapter(2).subchapters.map((s) => ({ ...s, hasBody: true })) };
    engine.getJob.mockResolvedValue(job({ course: { courseId: "course1", chapters: [chapter(1), written, chapter(3)] } }));
    const { ctx, sends, deckSends, release } = stubAgents();
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [2] }, ctx);
    expect(sends).toHaveLength(0);
    expect(deckSends).toHaveLength(1);
    expect(out).toEqual({ ok: true, chapters: [full(2)], failed: [] });
  });

  test("no saved lesson body: no deck is asked for and the chapter is incomplete", async () => {
    engine.getChapterContent.mockResolvedValue({ ...content(1), lessons: [{ order: 1, title: "L", body: " ", truncated: false }] });
    const { ctx, deckSends, release } = stubAgents();
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [1] }, ctx);
    expect(deckSends).toHaveLength(0);
    expect(out.failed).toEqual([
      { chapterOrder: 1, reason: "Slide deck: no lesson of the chapter is saved yet, so there is nothing to build slides from" },
    ]);
  });

  test("a lost progress event does not fail the fan-out", async () => {
    engine.reportProgress.mockRejectedValue(new Error("network down"));
    const { ctx, release } = stubAgents();
    release();
    const out = await execute(writeCourse, { jobId: "job1" }, ctx);
    expect(out).toEqual({ ok: true, chapters: [full(1), full(2), full(3)], failed: [] });
  });

  test("refuses unknown chapters, jobs not in writing and engine refusals without starting a writer", async () => {
    const { ctx, sends, deckSends } = stubAgents();
    expect(await execute(writeCourse, { jobId: "job1", chapterOrders: [2, 7] }, ctx)).toEqual({
      ok: false,
      message: "INVALID: the course has no chapter 7 (its chapters are 1, 2, 3)",
    });

    engine.getJob.mockResolvedValueOnce(job({ status: "ready" }));
    expect(await execute(writeCourse, { jobId: "job1" }, ctx)).toEqual({
      ok: false,
      message: "BAD_STATE: the job is ready; chapters can be written only while it is writing",
    });

    engine.getJob.mockResolvedValueOnce(job({ course: undefined }));
    expect((await execute(writeCourse, { jobId: "job1" }, ctx)).message).toMatch(/^BAD_STATE: the job has no course/);

    engine.getJob.mockRejectedValueOnce(new EngineError("NOT_FOUND: job nope"));
    expect(await execute(writeCourse, { jobId: "nope" }, ctx)).toEqual({ ok: false, message: "NOT_FOUND: job nope" });

    expect(sends).toHaveLength(0);
    expect(deckSends).toHaveLength(0);
  });

  test("a failed job (watchdog) can still be written: the engine resumes it", async () => {
    engine.getJob.mockResolvedValue(job({ status: "failed" }));
    const { ctx, sends, release } = stubAgents();
    release();
    const out = await execute(writeCourse, { jobId: "job1", chapterOrders: [3] }, ctx);
    expect(out.ok).toBe(true);
    expect(sends).toHaveLength(1);
  });
});

describe("finish_job", () => {
  const run = async (input: unknown) =>
    (await finishJob.execute(input as never, { abortSignal: new AbortController().signal } as never)) as Record<string, any>;

  test("finishes the job", async () => {
    expect(await run({ jobId: "job1" })).toEqual({ ok: true, status: "ready" });
    expect(engine.finishJob).toHaveBeenCalledWith({ jobId: "job1" });
  });

  test("a refusal returns the missing items and the chapters to write again", async () => {
    engine.finishJob.mockRejectedValueOnce(
      new EngineError('INCOMPLETE: Chapter 3: deck missing; Chapter 1: lesson "Budget" has no body; Chapter 3: test missing'),
    );
    expect(await run({ jobId: "job1" })).toEqual({
      ok: false,
      message: 'INCOMPLETE: Chapter 3: deck missing; Chapter 1: lesson "Budget" has no body; Chapter 3: test missing',
      missing: ["Chapter 3: deck missing", 'Chapter 1: lesson "Budget" has no body', "Chapter 3: test missing"],
      chapterOrders: [1, 3],
    });
  });

  test("the refusal parser reads chapter numbers only at segment starts, not inside lesson titles", () => {
    expect(
      missingFromRefusal(
        'INCOMPLETE: Chapter 2: lesson "Chapter 9: costs; Chapter 7: savings" has no body; Chapter 4: deck missing',
      ),
    ).toEqual({
      missing: ['Chapter 2: lesson "Chapter 9: costs; Chapter 7: savings" has no body', "Chapter 4: deck missing"],
      chapterOrders: [2, 4],
    });
    expect(missingFromRefusal("INCOMPLETE: the course has no chapters")).toEqual({
      missing: ["the course has no chapters"],
      chapterOrders: [],
    });
  });

  test("BAD_STATE comes back as a message with no chapters", async () => {
    engine.finishJob.mockRejectedValueOnce(new EngineError("BAD_STATE: finishJob is not allowed while the job is outline_ready"));
    const out = await run({ jobId: "job1" });
    expect(out).toMatchObject({ ok: false, message: "BAD_STATE: finishJob is not allowed while the job is outline_ready", chapterOrders: [] });
  });

  test("a non-engine failure still throws", async () => {
    engine.finishJob.mockRejectedValueOnce(new Error("Course engine is not configured"));
    await expect(run({ jobId: "job1" })).rejects.toThrow("not configured");
  });
});

describe("regenerate", () => {
  test("chapter → the write fan-out for that one chapter, with the instruction in both briefs", async () => {
    const { ctx, sends, deckSends, release } = stubAgents();
    release();
    const out = await execute(
      regenerate,
      { jobId: "job1", target: { kind: "chapter", chapterOrder: 2 }, instruction: "Use more examples" },
      ctx,
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.message.startsWith(buildWriterBrief(job(), 2))).toBe(true);
    expect(sends[0]?.message).toContain("Rewrite the whole chapter");
    expect(sends[0]?.message).toContain("Use more examples");
    expect(sends[0]?.message).not.toContain("Only redo");
    // The writer rewrites everything, so its brief carries no saved content.
    expect(sends[0]?.message).not.toContain("BODY-2.1");
    // The deck is rebuilt from the rewritten lessons, with the same instruction.
    expect(deckSends).toHaveLength(1);
    expect(deckSends[0].message).toBe(buildDeckBrief(job(), content(2), "Use more examples"));
    expect(out).toMatchObject({ ok: true, redone: true, chapters: [full(2)], failed: [], target: { kind: "chapter", chapterOrder: 2 } });
  });

  test.each([
    [{ kind: "subchapter", chapterOrder: 2, subchapterOrder: 1 }, 'Only redo subchapter 2.1 "Lesson 2.1": Simpler words', "`save_subchapter` (subchapterOrder 1)"],
    [{ kind: "test", chapterOrder: 2 }, "Only redo the test of chapter 2: Simpler words", "`save_test`"],
  ])("%o → one writer call with the brief plus the Only redo line", async (target, line, tool) => {
    const saved = {
      subchapter: { subchapters: 1, test: false },
      test: { subchapters: 0, test: true },
    }[target.kind as "subchapter" | "test"];
    const { ctx, sends, deckSends, release } = stubAgents(() => ({ chapterOrder: 2, saved, problems: [] }));
    release();
    const out = await execute(regenerate, { jobId: "job1", target, instruction: "Simpler words" }, ctx);

    expect(sends).toHaveLength(1);
    expect(sends[0]?.name).toBe("chapter-writer");
    expect(sends[0]?.options).toEqual({ outputSchema: writerOutputSchema, signal: ctx.abortSignal });
    expect(sends[0]?.message.startsWith(buildWriterBrief(job(), 2))).toBe(true);
    expect(sends[0]?.message).toContain(line);
    expect(sends[0]?.message).toContain(tool);
    // Grounded in what is saved: every lesson body of the chapter, plus the deck and test outline.
    expect(engine.getChapterContent).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: 2 });
    expect(sends[0]?.message).toContain("BODY-2.1 envelopes and percentages");
    expect(sends[0]?.message).toContain("BODY-2.2 review monthly");
    expect(sends[0]?.message).toContain("[Truncated: the saved body is longer.]");
    expect(sends[0]?.message).toContain("Why budget");
    expect(sends[0]?.message).toContain("What is a fixed cost?");
    // Only that item is redone: the deck is left as it is.
    expect(deckSends).toHaveLength(0);
    expect(out).toEqual({ ok: true, target, redone: true, saved: { ...saved, deck: false }, problems: [] });
    expect(chapterEvents().at(-1)?.message).toMatch(/^Regenerated /);
  });

  test("deck → the deck pipeline alone: no chapter writer, the instruction in the deck brief", async () => {
    const { ctx, sends, deckSends, release } = stubAgents();
    release();
    const target = { kind: "deck", chapterOrder: 2 };
    const out = await execute(regenerate, { jobId: "job1", target, instruction: "Simpler words" }, ctx);

    expect(sends).toHaveLength(0);
    expect(deckSends).toHaveLength(1);
    expect(deckSends[0].name).toBe("deck-writer");
    expect(deckSends[0].message).toBe(buildDeckBrief(job(), content(2), "Simpler words"));
    expect(deckSends[0].message).toContain("The admin asked: Simpler words");
    expect(deckSends[0].message).toContain("BODY-2.1 envelopes and percentages");
    expect(deckSends[0].message).toContain("- Why budget"); // the deck it replaces
    expect(deckSends[0].options).toEqual({ outputSchema: deckDraftSchema, signal: ctx.abortSignal });
    expect(engine.saveDeck).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: 2, ...goodDeck() });
    expect(out).toEqual({ ok: true, target, redone: true, saved: { subchapters: 0, deck: true, test: false }, problems: [] });
    expect(chapterEvents().at(-1)?.message).toBe("Regenerated the slide deck of chapter 2");
  });

  test("a subchapter regenerate marks the target and its neighbours (do not rewrite)", async () => {
    const { ctx, sends, release } = stubAgents(() => ({ chapterOrder: 2, saved: { subchapters: 1, test: false }, problems: [] }));
    release();
    await execute(regenerate, { jobId: "job1", target: { kind: "subchapter", chapterOrder: 2, subchapterOrder: 2 }, instruction: "x" }, ctx);
    const message = sends[0]!.message;
    expect(message).toContain('### Subchapter 2.1 "Lesson 2.1" (do not rewrite: context only)\n\nBODY-2.1');
    expect(message).toContain('### Subchapter 2.2 "Lesson 2.2" (saved version of the item you rewrite)\n\nBODY-2.2');
  });

  test("a test regenerate is told to ask only what the saved lessons teach", async () => {
    const { ctx, sends, release } = stubAgents(() => ({ chapterOrder: 2, saved: { subchapters: 0, test: true }, problems: [] }));
    release();
    await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 2 }, instruction: "x" }, ctx);
    expect(sends[0]!.message).toContain("Every question must be answerable from these saved lesson bodies");
  });

  test("an engine refusal of getChapterContent stops the regenerate before any writer", async () => {
    engine.getChapterContent.mockRejectedValueOnce(new EngineError("NOT_FOUND: chapter 2"));
    const { ctx, sends } = stubAgents();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 2 }, instruction: "x" }, ctx);
    expect(out).toEqual({ ok: false, message: "NOT_FOUND: chapter 2" });
    expect(sends).toHaveLength(0);
  });

  test("a deck regenerate that cannot load the lessons saves nothing and says why", async () => {
    engine.getChapterContent.mockRejectedValueOnce(new EngineError("NOT_FOUND: chapter 2"));
    const { ctx, deckSends } = stubAgents();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 2 }, instruction: "x" }, ctx);
    expect(out).toMatchObject({ ok: true, redone: false, problems: ["NOT_FOUND: chapter 2"] });
    expect(deckSends).toHaveLength(0);
    expect(engine.saveDeck).not.toHaveBeenCalled();
  });

  test("an empty instruction still tells the writer what to do", async () => {
    const { ctx, sends, deckSends, release } = stubAgents(() => ({ chapterOrder: 1, saved: { subchapters: 0, test: true }, problems: [] }));
    release();
    await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 1 }, instruction: "  " }, ctx);
    expect(sends[0]?.message).toContain("Only redo the test of chapter 1: (no instruction from the admin");
    await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 1 }, instruction: "  " }, ctx);
    expect(deckSends[0]?.message).toContain("The admin asked: (no instruction: write it again to a higher standard");
  });

  test("reports redone: false when the writer did not save the target", async () => {
    const { ctx, release } = stubAgents(() => ({
      chapterOrder: 1,
      saved: { subchapters: 0, test: false },
      problems: ["Test: Unknown reference: https://x.example"],
    }));
    release();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 1 }, instruction: "x" }, ctx);
    expect(out).toMatchObject({ ok: true, redone: false, problems: ["Test: Unknown reference: https://x.example"] });
    expect(chapterEvents().at(-1)?.message).toBe(
      "Regenerating the test of chapter 1 did not save it: Test: Unknown reference: https://x.example",
    );
  });

  test("reports redone: false when the deck stays refused; the saved deck is left as it was", async () => {
    engine.saveDeck.mockRejectedValue(new EngineError("Unknown reference: https://x.example"));
    const { ctx, deckSends, release } = stubAgents();
    release();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 1 }, instruction: "x" }, ctx);
    const reason = "the deck was not accepted after 2 retries: Unknown reference: https://x.example";
    expect(deckSends).toHaveLength(3);
    expect(deckSends[1].message).toMatch(/^The platform refused your deck\.[\s\S]*- Unknown reference: https:\/\/x\.example/);
    expect(out).toMatchObject({ ok: true, redone: false, saved: { deck: false }, problems: [reason] });
    expect(chapterEvents().at(-1)?.message).toBe(`Regenerating the slide deck of chapter 1 did not save it: ${reason}`);
  });

  test("a writer failure comes back as ok: false", async () => {
    const { ctx, release } = stubAgents(() => new Error("boom"));
    release();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 3 }, instruction: "x" }, ctx);
    expect(out).toEqual({ ok: false, message: "Regenerating the test of chapter 3 failed: boom" });
  });

  test("refuses unknown targets and jobs not in writing without starting a writer", async () => {
    const { ctx, sends, deckSends } = stubAgents();
    expect(
      await execute(regenerate, { jobId: "job1", target: { kind: "subchapter", chapterOrder: 2, subchapterOrder: 9 }, instruction: "x" }, ctx),
    ).toEqual({ ok: false, message: "INVALID: chapter 2 has no subchapter 9" });
    expect(
      await execute(regenerate, { jobId: "job1", target: { kind: "subchapter", chapterOrder: 2 }, instruction: "x" }, ctx),
    ).toEqual({ ok: false, message: "INVALID: target.subchapterOrder is required for a subchapter" });
    expect(
      (await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 4 }, instruction: "x" }, ctx)).message,
    ).toMatch(/^INVALID: the course has no chapter 4/);
    engine.getJob.mockResolvedValueOnce(job({ status: "ready" }));
    expect(
      (await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 1 }, instruction: "x" }, ctx)).message,
    ).toMatch(/^BAD_STATE: the job is ready/);
    expect(sends).toHaveLength(0);
    expect(deckSends).toHaveLength(0);
  });
});

describe("fail_job", () => {
  const run = async (input: unknown) =>
    (await failJob.execute(input as never, { abortSignal: new AbortController().signal } as never)) as Record<string, any>;

  test("fails the job with the real cause", async () => {
    expect(await run({ jobId: "job1", error: "Chapter 2 is still incomplete: deck missing" })).toEqual({ ok: true, status: "failed" });
    expect(engine.failJob).toHaveBeenCalledWith({ jobId: "job1", error: "Chapter 2 is still incomplete: deck missing" });
  });

  test("an engine refusal comes back as ok: false", async () => {
    engine.failJob.mockRejectedValueOnce(new EngineError("BAD_STATE: failJob is not allowed while the job is ready"));
    expect(await run({ jobId: "job1", error: "x" })).toEqual({
      ok: false,
      message: "BAD_STATE: failJob is not allowed while the job is ready",
    });
  });
});
