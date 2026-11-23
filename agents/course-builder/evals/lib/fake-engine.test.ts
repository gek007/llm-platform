// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";
import { createEngineClient, EngineError } from "../../agent/lib/engine-client";
import { createFakeEngine, serveFakeEngine, tinyCourseJob } from "./fake-engine";

const slides = Array.from({ length: 6 }, (_, i) => ({ layout: "bullets" as const, title: `S${i + 1}`, bullets: ["Point"], notes: "Say it." }));
const questions = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i + 1}`,
  kind: "true_false" as const,
  prompt: `Statement ${i + 1}`,
  options: ["True", "False"],
  correct: [0],
  explanation: "Because.",
}));
const lesson = (subchapterOrder: number, body = "Fixed costs come first [1].\n\n```quiz\n{}\n```") => ({
  jobId: "fakejob_tiny_course",
  chapterOrder: 1,
  subchapterOrder,
  title: "T",
  summary: "S",
  body,
  durationMinutes: 10,
  sourceIds: ["src_50_30_20"],
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start() {
  const engine = createFakeEngine(tinyCourseJob());
  const server = await serveFakeEngine(engine);
  close = server.close;
  return { engine, client: createEngineClient({ baseUrl: server.url, secret: "test-secret" }) };
}

describe("eval fake engine", () => {
  test("speaks the engine wire format to the agent's real client: write a chapter, then finish", async () => {
    const { engine, client } = await start();
    const job = await client.getJob({ jobId: "fakejob_tiny_course" });
    expect(job.course?.chapters[0]).toMatchObject({ order: 1, hasDeck: false, hasTest: false });

    const finish = client.finishJob({ jobId: "fakejob_tiny_course" });
    await expect(finish).rejects.toThrow(EngineError);
    await expect(finish).rejects.toThrow(
      'INCOMPLETE: Chapter 1: lesson "Know your income and expenses" has no body; Chapter 1: lesson "Balance and review your budget" has no body; Chapter 1: deck missing; Chapter 1: test missing',
    );

    await client.saveSubchapter(lesson(1));
    await client.saveSubchapter(lesson(2));
    await client.saveDeck({ jobId: "fakejob_tiny_course", chapterOrder: 1, slides });
    expect(await client.saveTest({ jobId: "fakejob_tiny_course", chapterOrder: 1, questions })).toEqual({ testId: "test-1", version: 1 });
    await client.finishJob({ jobId: "fakejob_tiny_course" });
    expect(engine.job.status).toBe("ready");
    expect((await client.getJob({ jobId: "fakejob_tiny_course" })).course?.chapters[0]).toMatchObject({ hasDeck: true, hasTest: true });
    // Content saves are refused once the job is ready (R6).
    await expect(client.saveDeck({ jobId: "fakejob_tiny_course", chapterOrder: 1, slides })).rejects.toThrow(/^BAD_STATE/);
  });

  test("validates like the real engine: counts, questions, refs, sources, orders", async () => {
    const { client } = await start();
    await expect(client.saveDeck({ jobId: "fakejob_tiny_course", chapterOrder: 1, slides: slides.slice(0, 5) })).rejects.toThrow(
      "INVALID: a deck needs 6-12 slides, got 5",
    );
    await expect(
      client.saveTest({ jobId: "fakejob_tiny_course", chapterOrder: 1, questions: questions.map((q) => ({ ...q, correct: [0, 1] })) }),
    ).rejects.toThrow("INVALID: question q1: Single and true/false questions need exactly 1 correct answer");
    await expect(client.saveSubchapter(lesson(1, "See https://invented.example.com/x"))).rejects.toThrow(
      "Unknown reference: https://invented.example.com/x",
    );
    await expect(client.saveSubchapter({ ...lesson(1), sourceIds: ["nope"] })).rejects.toThrow("NOT_FOUND: source nope");
    await expect(client.saveSubchapter(lesson(3))).rejects.toThrow("NOT_FOUND: subchapter 1.3");
    await expect(client.saveDeck({ jobId: "fakejob_tiny_course", chapterOrder: 2, slides })).rejects.toThrow("NOT_FOUND: chapter 2");
    await expect(client.getJob({ jobId: "other" })).rejects.toThrow("NOT_FOUND: job other");
    // The saved source's URL is allowed.
    await client.saveSubchapter(lesson(1, "Read [the guide](https://example.org/budgeting-basics) [1]."));
  });
});
