// @vitest-environment node
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { EngineError, type EngineClient } from "../../../lib/engine-client";

// Fake engine: every op is a spy; tests make an op fail with the engine's own error text.
const engine = {
  saveSubchapter: vi.fn(async () => ({ lessonId: "lesson1" })),
  saveDeck: vi.fn(async () => ({ deckId: "deck1" })),
  saveTest: vi.fn(async () => ({ testId: "test1", version: 1 })),
  reportProgress: vi.fn(async () => {}),
};
vi.mock("../../../lib/engine-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/engine-client")>()),
  engineFromEnv: () => engine as unknown as EngineClient,
}));

import rootReportProgress from "../../../tools/report_progress";
import reportProgress from "./report_progress";
import saveDeck from "./save_deck";
import saveSubchapter from "./save_subchapter";
import saveTest from "./save_test";

const ctx = { abortSignal: new AbortController().signal } as unknown as ToolContext;
/* eslint-disable @typescript-eslint/no-explicit-any */
const run = async (tool: { execute: (i: never, c: ToolContext) => unknown }, input: unknown) =>
  (await tool.execute(input as never, ctx)) as Record<string, any>;

const UNKNOWN = "Unknown reference: https://invented.example.com/page";

const subchapter = {
  jobId: "job1",
  chapterOrder: 2,
  subchapterOrder: 3,
  title: "Balance it",
  summary: "Adjust spending until the budget balances.",
  body: "Start with fixed costs [1].\n\n```quiz\n{\"question\":\"Q?\",\"options\":[\"A\",\"B\"],\"answer\":0}\n```",
  durationMinutes: 12,
  sourceIds: ["src-a"],
};

const slides = Array.from({ length: 6 }, (_, i) => ({
  layout: "bullets" as const,
  title: `Slide ${i + 1}`,
  bullets: ["Point"],
  notes: "Say this. Then that.",
}));

const questions = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i + 1}`,
  kind: "true_false" as const,
  prompt: `Statement ${i + 1}`,
  options: ["True", "False"],
  correct: [0],
  explanation: "Because.",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("save_subchapter", () => {
  test("passes chapterOrder and subchapterOrder (and every field) through to the engine", async () => {
    const out = await run(saveSubchapter, subchapter);
    expect(engine.saveSubchapter).toHaveBeenCalledWith(subchapter);
    expect(out).toEqual({ ok: true, chapterOrder: 2, subchapterOrder: 3, lessonId: "lesson1" });
  });

  test("returns { ok: false, message } with the engine's Unknown reference text", async () => {
    engine.saveSubchapter.mockRejectedValueOnce(new EngineError(UNKNOWN));
    expect(await run(saveSubchapter, subchapter)).toEqual({ ok: false, message: UNKNOWN });
  });
});

describe("save_deck", () => {
  test("passes chapterOrder and the slides through to the engine", async () => {
    const out = await run(saveDeck, { jobId: "job1", chapterOrder: 2, slides });
    expect(engine.saveDeck).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: 2, slides });
    expect(out).toEqual({ ok: true, chapterOrder: 2, deckId: "deck1", slides: 6 });
  });

  test("returns { ok: false, message } with the engine's Unknown reference text", async () => {
    engine.saveDeck.mockRejectedValueOnce(new EngineError(UNKNOWN));
    expect(await run(saveDeck, { jobId: "job1", chapterOrder: 2, slides })).toEqual({ ok: false, message: UNKNOWN });
  });
});

describe("save_test", () => {
  test("passes chapterOrder and the questions through to the engine", async () => {
    const out = await run(saveTest, { jobId: "job1", chapterOrder: 2, questions });
    expect(engine.saveTest).toHaveBeenCalledWith({ jobId: "job1", chapterOrder: 2, questions });
    expect(out).toEqual({ ok: true, chapterOrder: 2, testId: "test1", version: 1, questions: 8 });
  });

  test("returns { ok: false, message } with the engine's Unknown reference or INVALID text", async () => {
    engine.saveTest.mockRejectedValueOnce(new EngineError(UNKNOWN));
    expect(await run(saveTest, { jobId: "job1", chapterOrder: 2, questions })).toEqual({ ok: false, message: UNKNOWN });
    const invalid = "INVALID: question q1: Single and true/false questions need exactly 1 correct answer";
    engine.saveTest.mockRejectedValueOnce(new EngineError(invalid));
    expect(await run(saveTest, { jobId: "job1", chapterOrder: 2, questions })).toEqual({ ok: false, message: invalid });
  });
});

describe("report_progress", () => {
  test("is the root agent's shared tool, not a second copy (R10)", async () => {
    expect(reportProgress).toBe(rootReportProgress);
    const input = { jobId: "job1", kind: "chapter", message: "Saved subchapter 2.1", chapterOrder: 2 };
    expect(await run(reportProgress, input)).toEqual({ ok: true });
    expect(engine.reportProgress).toHaveBeenCalledWith(input);
  });
});
