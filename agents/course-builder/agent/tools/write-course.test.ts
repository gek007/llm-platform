// @vitest-environment node
import type { WorkflowToolContext } from "eve/tools";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { JobBrief } from "../../../../convex/lib/engineTypes";
import { EngineError, type EngineClient } from "../lib/engine-client";
import { buildWriterBrief, writerOutputSchema, type WriterOutput } from "../lib/writer-brief";

// Fake engine: every op is a spy; tests set what getJob returns or make finishJob refuse.
const engine = {
  getJob: vi.fn(),
  reportProgress: vi.fn<(args: unknown) => Promise<void>>(async () => {}),
  finishJob: vi.fn(async () => {}),
};
vi.mock("../lib/engine-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/engine-client")>()),
  engineFromEnv: () => engine as unknown as EngineClient,
}));

import finishJob from "./finish_job";
import regenerate from "./regenerate";
import writeCourse from "./write_course";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Outcome = WriterOutput | Error | { status: "failed"; message: string };

/**
 * A stubbed `ctx.agent`: every `send` is recorded, and its result waits until the test releases
 * it, so a test can check that all writers started before any finished. `outcome(chapterOrder)`
 * decides what each writer answers (default: everything saved).
 */
function stubAgents(outcome: (chapterOrder: number) => Outcome = (n) => full(n)) {
  const sends: { name: string; message: string; options: any }[] = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const ctx = {
    abortSignal: new AbortController().signal,
    agents: {},
    agent: vi.fn((name: string) => ({
      async send(message: string, options: any) {
        sends.push({ name, message, options });
        const order = Number(/^# Write chapter (\d+)/.exec(message)?.[1]);
        const out = outcome(order);
        if (out instanceof Error) throw out;
        return {
          async result() {
            await released;
            if ("status" in out) return { status: "failed", error: { message: out.message } };
            return { status: "completed", data: out };
          },
        };
      },
    })),
  };
  return { ctx: ctx as unknown as WorkflowToolContext, sends, release };
}

const full = (chapterOrder: number, subchapters = 2): WriterOutput => ({
  chapterOrder,
  saved: { subchapters, deck: true, test: true },
  problems: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  engine.getJob.mockResolvedValue(job());
});

describe("write_course", () => {
  test("3 chapters → 3 chapter-writer sends, all started before any finishes", async () => {
    const { ctx, sends, release } = stubAgents();
    const pending = execute(writeCourse, { jobId: "job1" }, ctx);
    await settle();
    // Every writer is already running while none has answered: the fan-out is parallel.
    expect(sends).toHaveLength(3);
    release();
    const out = await pending;

    expect(engine.getJob).toHaveBeenCalledWith({ jobId: "job1" });
    expect(ctx.agent).toHaveBeenCalledTimes(3);
    expect(sends.map((s) => s.name)).toEqual(["chapter-writer", "chapter-writer", "chapter-writer"]);
    for (const n of [1, 2, 3]) {
      const send = sends.find((s) => s.message === buildWriterBrief(job(), n));
      expect(send?.options).toEqual({ outputSchema: writerOutputSchema, signal: ctx.abortSignal });
    }
    expect(out).toEqual({ ok: true, chapters: [full(1), full(2), full(3)], failed: [] });
    // One chapter event per finished writer.
    expect(chapterEvents().map((e) => e.chapterOrder).sort()).toEqual([1, 2, 3]);
    expect(chapterEvents()[0]?.message).toMatch(/written: 2 subchapters, slide deck and test saved/);
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
    const { ctx, sends, release } = stubAgents((n) =>
      n === 1
        ? { chapterOrder: 1, saved: { subchapters: 2, deck: true, test: false }, problems: ["Test: INVALID: duplicate ids"] }
        : n === 2
          ? new Error("child session crashed")
          : full(n),
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
    const events = chapterEvents();
    expect(events.map((e) => e.chapterOrder).sort()).toEqual([1, 2, 3]);
    expect(events.find((e) => e.chapterOrder === 2)?.message).toBe("Chapter 2 failed: child session crashed");
    expect(events.find((e) => e.chapterOrder === 1)?.message).toMatch(/^Chapter 1 is incomplete: test not saved/);
  });

  test("a failed writer turn and a missing subchapter both land in failed", async () => {
    const { ctx, release } = stubAgents((n) =>
      n === 1 ? { status: "failed", message: "model overloaded" } : n === 2 ? full(2, 1) : full(n),
    );
    release();
    const out = await execute(writeCourse, { jobId: "job1" }, ctx);
    expect(out.failed).toEqual([
      { chapterOrder: 1, reason: "the writer failed: model overloaded" },
      { chapterOrder: 2, reason: "1 of 2 subchapters saved" },
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
    const { ctx, sends } = stubAgents();
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
  test("chapter → the write fan-out for that one chapter, with the instruction", async () => {
    const { ctx, sends, release } = stubAgents();
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
    expect(out).toMatchObject({ ok: true, redone: true, chapters: [full(2)], failed: [], target: { kind: "chapter", chapterOrder: 2 } });
  });

  test.each([
    [{ kind: "subchapter", chapterOrder: 2, subchapterOrder: 1 }, 'Only redo subchapter 2.1 "Lesson 2.1": Simpler words', "`save_subchapter` (subchapterOrder 1)"],
    [{ kind: "deck", chapterOrder: 2 }, "Only redo the slide deck of chapter 2: Simpler words", "`save_deck`"],
    [{ kind: "test", chapterOrder: 2 }, "Only redo the test of chapter 2: Simpler words", "`save_test`"],
  ])("%o → one writer call with the brief plus the Only redo line", async (target, line, tool) => {
    const saved = {
      subchapter: { subchapters: 1, deck: false, test: false },
      deck: { subchapters: 0, deck: true, test: false },
      test: { subchapters: 0, deck: false, test: true },
    }[target.kind as "subchapter" | "deck" | "test"];
    const { ctx, sends, release } = stubAgents(() => ({ chapterOrder: 2, saved, problems: [] }));
    release();
    const out = await execute(regenerate, { jobId: "job1", target, instruction: "Simpler words" }, ctx);

    expect(sends).toHaveLength(1);
    expect(sends[0]?.name).toBe("chapter-writer");
    expect(sends[0]?.options).toEqual({ outputSchema: writerOutputSchema, signal: ctx.abortSignal });
    expect(sends[0]?.message.startsWith(buildWriterBrief(job(), 2))).toBe(true);
    expect(sends[0]?.message).toContain(line);
    expect(sends[0]?.message).toContain(tool);
    expect(out).toEqual({ ok: true, target, redone: true, saved, problems: [] });
    expect(chapterEvents().at(-1)?.message).toMatch(/^Regenerated /);
  });

  test("an empty instruction still tells the writer what to do", async () => {
    const { ctx, sends, release } = stubAgents(() => ({ chapterOrder: 1, saved: { subchapters: 0, deck: true, test: false }, problems: [] }));
    release();
    await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 1 }, instruction: "  " }, ctx);
    expect(sends[0]?.message).toContain("Only redo the slide deck of chapter 1: (no instruction from the admin");
  });

  test("reports redone: false when the writer did not save the target", async () => {
    const { ctx, release } = stubAgents(() => ({
      chapterOrder: 1,
      saved: { subchapters: 0, deck: false, test: false },
      problems: ["Deck: Unknown reference: https://x.example"],
    }));
    release();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "deck", chapterOrder: 1 }, instruction: "x" }, ctx);
    expect(out).toMatchObject({ ok: true, redone: false, problems: ["Deck: Unknown reference: https://x.example"] });
    expect(chapterEvents().at(-1)?.message).toBe(
      "Regenerating the slide deck of chapter 1 did not save it: Deck: Unknown reference: https://x.example",
    );
  });

  test("a writer failure comes back as ok: false", async () => {
    const { ctx, release } = stubAgents(() => new Error("boom"));
    release();
    const out = await execute(regenerate, { jobId: "job1", target: { kind: "test", chapterOrder: 3 }, instruction: "x" }, ctx);
    expect(out).toEqual({ ok: false, message: "Regenerating the test of chapter 3 failed: boom" });
  });

  test("refuses unknown targets and jobs not in writing without starting a writer", async () => {
    const { ctx, sends } = stubAgents();
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
  });
});
