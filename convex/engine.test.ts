/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { checkEngineSecret } from "./lib/engineAuth";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const SECRET = "test-engine-secret-not-real";
const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;
const asAdmin = (t: T) => t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });

const jobArgs = { topic: "Intro to RAG", language: "en", level: "beginner", length: "short" } as const;
const sub = (n: string) => ({ title: n, goal: `goal ${n}` });
const outline2x2 = {
  chapters: [1, 2].map((c) => ({
    title: `Ch ${c}`,
    goal: `g${c}`,
    subchapters: [sub(`S${c}.1`), sub(`S${c}.2`)],
  })),
};
const slides = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    layout: "bullets" as const,
    title: `Slide ${i + 1}`,
    bullets: ["one", "two"],
    notes: "Speaker notes.",
  }));
const questions = (n: number, prompt = "Q") =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    kind: "single" as const,
    prompt: `${prompt} ${i + 1}?`,
    options: ["A", "B", "C"],
    correct: [0],
    explanation: "Because A.",
  }));

type Json = Record<string, unknown>;
async function post(t: T, op: string, body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  const res = await t.fetch(`/engine/${op}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as Json };
}

async function setStatus(t: T, jobId: Id<"generationJobs">, status: string, extra: object = {}) {
  await t.run((ctx) => ctx.db.patch(jobId, { status: status as never, ...extra }));
}
async function researchingJob(t: T) {
  const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
  await asAdmin(t).mutation(api.generation.startJob, { jobId });
  return jobId;
}
async function writingJob(t: T) {
  const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
  await setStatus(t, jobId, "outline_ready", { outline: outline2x2 });
  const courseId = await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
  return { jobId, courseId };
}
const job = (t: T, jobId: Id<"generationJobs">) => t.run((ctx) => ctx.db.get(jobId));
const events = (t: T, jobId: Id<"generationJobs">) =>
  t.run((ctx) =>
    ctx.db.query("generationEvents").withIndex("by_job_at", (q) => q.eq("jobId", jobId)).collect(),
  );
const sub11 = (jobId: string, extra: object = {}) => ({
  jobId,
  chapterOrder: 1,
  subchapterOrder: 1,
  title: "What is RAG",
  summary: "Retrieval plus generation.",
  body: "RAG combines retrieval with generation [1].",
  durationMinutes: 8,
  sourceIds: [],
  ...extra,
});

beforeEach(() => {
  process.env.COURSE_ENGINE_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.COURSE_ENGINE_SECRET;
});

describe("checkEngineSecret", () => {
  it("accepts only the exact bearer secret", () => {
    expect(checkEngineSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(checkEngineSecret(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(checkEngineSecret(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(checkEngineSecret(SECRET, SECRET)).toBe(false);
    expect(checkEngineSecret(null, SECRET)).toBe(false);
    expect(checkEngineSecret("Bearer ", SECRET)).toBe(false);
  });
  it("is false when the secret is unset or empty", () => {
    expect(checkEngineSecret("Bearer ", "")).toBe(false);
    expect(checkEngineSecret("Bearer undefined", undefined)).toBe(false);
    expect(checkEngineSecret("Bearer x", undefined)).toBe(false);
  });
});

describe("engine HTTP auth and routing", () => {
  it("missing or wrong secret is 401, also for getJob", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    expect((await post(t, "getJob", { jobId }, null)).status).toBe(401);
    expect((await post(t, "getJob", { jobId }, "Bearer wrong")).status).toBe(401);
    expect((await post(t, "saveOutline", { jobId, outline: outline2x2 }, null)).status).toBe(401);
    expect((await job(t, jobId))?.status).toBe("researching");
  });
  it("is 401 for everyone when the deployment has no secret", async () => {
    const t = makeT();
    delete process.env.COURSE_ENGINE_SECRET;
    expect((await post(t, "getJob", { jobId: "x" }, "Bearer ")).status).toBe(401);
    expect((await post(t, "getJob", { jobId: "x" }, "Bearer undefined")).status).toBe(401);
  });
  it("unknown op is 404; prototype keys are not ops", async () => {
    const t = makeT();
    expect((await post(t, "dropTables", {})).status).toBe(404);
    expect((await post(t, "constructor", {})).status).toBe(404);
    expect((await post(t, "__proto__", {})).status).toBe(404);
  });
  it("bad JSON, unknown job and invalid args are 400 with ok:false", async () => {
    const t = makeT();
    const res = await t.fetch("/engine/getJob", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const bogus = await post(t, "getJob", { jobId: "bogus" });
    expect(bogus.status).toBe(400);
    expect(bogus.json.ok).toBe(false);
    const jobId = await researchingJob(t);
    const bad = await post(t, "reportProgress", { jobId, kind: "nope", message: "x" });
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).not.toMatch(/\n\s+at /);
  });
});

describe("getJob", () => {
  it("returns the brief with resources and, after approval, the course", async () => {
    const t = makeT();
    const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    await asAdmin(t).mutation(api.generation.addResource, {
      jobId,
      kind: "url",
      url: "https://docs.example.com/guide",
    });
    await setStatus(t, jobId, "outline_ready", { outline: outline2x2 });
    await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
    const { status, json } = await post(t, "getJob", { jobId });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, jobId, status: "writing", topic: "Intro to RAG", language: "en" });
    expect(json.resources).toEqual([
      expect.objectContaining({ kind: "url", url: "https://docs.example.com/guide", readStatus: "pending" }),
    ]);
    const course = json.course as { chapters: { order: number; subchapters: unknown[]; hasDeck: boolean }[] };
    expect(course.chapters).toHaveLength(2);
    expect(course.chapters[0]).toMatchObject({ order: 1, hasDeck: false, hasTest: false });
    expect(course.chapters[0].subchapters).toEqual([
      { order: 1, title: "S1.1", hasBody: false },
      { order: 2, title: "S1.2", hasBody: false },
    ]);
  });
});

describe("research phase", () => {
  it("saveSources upserts by normalized url and returns ids", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    const first = await post(t, "saveSources", {
      jobId,
      sources: [{ url: "https://docs.example.com/guide/#top", title: "Guide", kind: "web" }],
    });
    expect(first.status).toBe(200);
    const again = await post(t, "saveSources", {
      jobId,
      sources: [{ url: "https://docs.example.com/guide", title: "Guide v2", kind: "web" }],
    });
    const [a] = (first.json.sources as { id: string; url: string }[]) ?? [];
    const [b] = (again.json.sources as { id: string; url: string }[]) ?? [];
    expect(a).toEqual({ id: b.id, url: "https://docs.example.com/guide" });
    const rows = await t.run((ctx) => ctx.db.query("generationSources").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Guide v2");
  });
  it("saveSources rejects non-http urls", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    const res = await post(t, "saveSources", {
      jobId,
      sources: [{ url: "javascript:alert(1)", title: "x", kind: "web" }],
    });
    expect(res.status).toBe(400);
  });
  it("saveOutline moves researching -> outline_ready and enforces caps", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    const tooMany = { chapters: Array.from({ length: 11 }, () => outline2x2.chapters[0]) };
    expect((await post(t, "saveOutline", { jobId, outline: tooMany })).status).toBe(400);
    expect((await post(t, "saveOutline", { jobId, outline: { chapters: [] } })).status).toBe(400);
    expect((await post(t, "saveOutline", { jobId, outline: outline2x2 })).status).toBe(200);
    const saved = await job(t, jobId);
    expect(saved?.status).toBe("outline_ready");
    expect(saved?.outline).toEqual(outline2x2);
    // A different outline after the phase ended is refused (admin edits are not overwritten).
    const other = { chapters: [outline2x2.chapters[0]] };
    expect((await post(t, "saveOutline", { jobId, outline: other })).json.error).toMatch(/BAD_STATE/);
  });
  it("reportProgress logs an event; setResourceStatus updates the job's resource only", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    const res = await post(t, "reportProgress", { jobId, kind: "source", message: "Read 3 pages" });
    expect(res.status).toBe(200);
    expect((await events(t, jobId)).some((e) => e.message === "Read 3 pages")).toBe(true);
    const resourceId = await t.run((ctx) =>
      ctx.db.insert("courseResources", {
        jobId,
        kind: "pdf",
        title: "Paper",
        origin: "admin",
        readStatus: "pending",
      }),
    );
    const ok = await post(t, "setResourceStatus", { jobId, resourceId, readStatus: "unreadable" });
    expect(ok.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(resourceId)))?.readStatus).toBe("unreadable");
    const otherJob = await researchingJob(t);
    const foreign = await post(t, "setResourceStatus", { jobId: otherJob, resourceId, readStatus: "read" });
    expect(foreign.status).toBe(400);
  });
});

describe("saveSubchapter", () => {
  it("replaying saveSubchapter patches the same lesson, no duplicate", async () => {
    const t = makeT();
    const { jobId, courseId } = await writingJob(t);
    const src = await post(t, "saveSources", {
      jobId,
      sources: [{ url: "https://docs.example.com/guide", title: "Guide", kind: "web" }],
    });
    const sourceId = (src.json.sources as { id: string }[])[0].id;
    const body = sub11(jobId, {
      sourceIds: [sourceId],
      body: "Read [the guide](https://docs.example.com/guide/) [1].",
    });
    const r1 = await post(t, "saveSubchapter", body);
    const r2 = await post(t, "saveSubchapter", body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.json.lessonId).toBe(r2.json.lessonId);
    const lessons = await t.run((ctx) =>
      ctx.db.query("lessons").withIndex("by_course_order", (q) => q.eq("courseId", courseId)).collect(),
    );
    expect(lessons).toHaveLength(4);
    expect(lessons[0]).toMatchObject({
      _id: r1.json.lessonId,
      title: "What is RAG",
      slug: "lesson-1-1",
      durationMinutes: 8,
      sourceIds: [sourceId],
    });
  });
  it("foreign sourceId is 400", async () => {
    const t = makeT();
    const other = await researchingJob(t);
    const src = await post(t, "saveSources", {
      jobId: other,
      sources: [{ url: "https://docs.example.com/guide", title: "Guide", kind: "web" }],
    });
    const foreignId = (src.json.sources as { id: string }[])[0].id;
    const { jobId } = await writingJob(t);
    const res = await post(t, "saveSubchapter", sub11(jobId, { sourceIds: [foreignId] }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/source/i);
  });
  it("markdown with an unseen URL is 400 naming it", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const res = await post(t, "saveSubchapter", sub11(jobId, { body: "See https://invented.example/x." }));
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ ok: false, error: "Unknown reference: https://invented.example/x" });
    const inTitle = await post(t, "saveSubchapter", sub11(jobId, { title: "See https://invented.example/t" }));
    expect(inTitle.json.error).toBe("Unknown reference: https://invented.example/t");
  });
  it("admin resources count as known refs", async () => {
    const t = makeT();
    const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const resourceId = await asAdmin(t).mutation(api.generation.addResource, {
      jobId,
      kind: "youtube",
      url: videoUrl,
    });
    await setStatus(t, jobId, "outline_ready", { outline: outline2x2 });
    await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
    const md = [
      "```youtube",
      JSON.stringify({ videoId: "dQw4w9WgXcQ", title: "Talk" }),
      "```",
      "",
      "```resource",
      JSON.stringify({ resourceId }),
      "```",
      "",
      `[watch](${videoUrl})`,
    ].join("\n");
    expect((await post(t, "saveSubchapter", sub11(jobId, { body: md }))).status).toBe(200);
  });
  it("is BAD_STATE outside writing (researching, ready)", async () => {
    const t = makeT();
    const researching = await researchingJob(t);
    expect((await post(t, "saveSubchapter", sub11(researching))).json.error).toMatch(/BAD_STATE/);
    const { jobId } = await writingJob(t);
    await setStatus(t, jobId, "ready");
    const res = await post(t, "saveSubchapter", sub11(jobId));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/BAD_STATE/);
  });
  it("unknown chapter or subchapter is 400", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    expect((await post(t, "saveSubchapter", sub11(jobId, { chapterOrder: 3 }))).status).toBe(400);
    expect((await post(t, "saveSubchapter", sub11(jobId, { subchapterOrder: 3 }))).status).toBe(400);
  });
});

describe("saveDeck and saveTest", () => {
  it("saveDeck needs 6-12 slides and upserts one row per chapter", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(5) })).status).toBe(400);
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(13) })).status).toBe(400);
    const a = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(6) });
    const b = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(7) });
    expect(a.status).toBe(200);
    expect(a.json.deckId).toBe(b.json.deckId);
    const decks = await t.run((ctx) => ctx.db.query("slideDecks").collect());
    expect(decks).toHaveLength(1);
    expect(decks[0].slides).toHaveLength(7);
  });
  it("saveTest with a single question that has two correct answers is 400", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const qs = questions(8);
    qs[2] = { ...qs[2], correct: [0, 1] };
    const res = await post(t, "saveTest", { jobId, chapterOrder: 1, questions: qs });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/q3/);
  });
  it("saveTest rejects empty strings, duplicate ids and counts outside 8-10", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const empty = questions(8);
    empty[0] = { ...empty[0], prompt: "  " };
    expect((await post(t, "saveTest", { jobId, chapterOrder: 1, questions: empty })).status).toBe(400);
    const dup = questions(8);
    dup[1] = { ...dup[1], id: "q1" };
    expect((await post(t, "saveTest", { jobId, chapterOrder: 1, questions: dup })).status).toBe(400);
    expect((await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(7) })).status).toBe(400);
    expect((await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(11) })).status).toBe(400);
  });
  it("saveTest upserts one row; version bumps only when questions change", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const a = await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(8) });
    const b = await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(8) });
    expect(a.json.testId).toBe(b.json.testId);
    let tests = await t.run((ctx) => ctx.db.query("chapterTests").collect());
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ version: 1, passPercent: 70, maxAttempts: 3 });
    await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(8, "Changed") });
    tests = await t.run((ctx) => ctx.db.query("chapterTests").collect());
    expect(tests).toHaveLength(1);
    expect(tests[0].version).toBe(2);
  });
});

describe("finishJob and failJob", () => {
  async function fillAll(t: T, jobId: string, skipDeckFor?: number) {
    for (const c of [1, 2]) {
      for (const s of [1, 2]) {
        const r = await post(t, "saveSubchapter", sub11(jobId, { chapterOrder: c, subchapterOrder: s }));
        expect(r.status).toBe(200);
      }
      if (c !== skipDeckFor) await post(t, "saveDeck", { jobId, chapterOrder: c, slides: slides(6) });
      await post(t, "saveTest", { jobId, chapterOrder: c, questions: questions(8) });
    }
  }
  it("finishJob with a missing deck is 400 listing the chapter", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    await fillAll(t, jobId, 2);
    const res = await post(t, "finishJob", { jobId });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Chapter 2: deck/);
    expect(res.json.error).not.toMatch(/Chapter 1/);
    expect((await job(t, jobId))?.status).toBe("writing");
  });
  it("finishJob lists empty lessons and moves a complete job to ready", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const early = await post(t, "finishJob", { jobId });
    expect(early.json.error).toMatch(/S1\.1/);
    await fillAll(t, jobId);
    expect((await post(t, "finishJob", { jobId })).status).toBe(200);
    expect((await job(t, jobId))?.status).toBe("ready");
  });
  it("failJob fails a non-terminal job with the error", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    expect((await post(t, "failJob", { jobId, error: "web_search down" })).status).toBe(200);
    expect(await job(t, jobId)).toMatchObject({ status: "failed", error: "web_search down" });
  });
  it("a late save on a failed (approved) job resumes writing and logs Resumed", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    await post(t, "failJob", { jobId, error: "No progress for 15 minutes" });
    const res = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(6) });
    expect(res.status).toBe(200);
    const after = await job(t, jobId);
    expect(after?.status).toBe("writing");
    expect(after?.error).toBeUndefined();
    expect((await events(t, jobId)).some((e) => e.message.includes("Resumed"))).toBe(true);
  });
  it("a late research write on a failed job before approval resumes researching", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    await setStatus(t, jobId, "failed", { error: "boom" });
    expect((await post(t, "reportProgress", { jobId, kind: "info", message: "still here" })).status).toBe(200);
    expect((await job(t, jobId))?.status).toBe("researching");
    // ...but content saves are not allowed before approval.
    await setStatus(t, jobId, "failed", { error: "boom" });
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(6) })).status).toBe(400);
    expect((await job(t, jobId))?.status).toBe("failed");
  });
});

describe("published courses are off limits to the engine", () => {
  async function publish(t: T, courseId: Id<"courses">) {
    await t.run((ctx) => ctx.db.patch(courseId, { status: "published" }));
  }
  it("failed job with a published course: saveSubchapter is BAD_STATE, job stays failed, lesson unchanged", async () => {
    const t = makeT();
    const { jobId, courseId } = await writingJob(t);
    await post(t, "failJob", { jobId, error: "No progress for 15 minutes" });
    await publish(t, courseId);
    const lessonsBefore = await t.run((ctx) => ctx.db.query("lessons").collect());
    const res = await post(t, "saveSubchapter", sub11(jobId));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/^BAD_STATE: Course is published/);
    expect(await job(t, jobId)).toMatchObject({ status: "failed", error: "No progress for 15 minutes" });
    expect(await t.run((ctx) => ctx.db.query("lessons").collect())).toEqual(lessonsBefore);
    expect((await events(t, jobId)).some((e) => e.message.includes("Resumed"))).toBe(false);
    // The failed -> writing resume path is refused for non-content writes too.
    expect((await post(t, "reportProgress", { jobId, kind: "info", message: "hi" })).status).toBe(400);
    expect((await job(t, jobId))?.status).toBe("failed");
  });
  it("writing job whose course was published: saveDeck, saveTest, finishJob are BAD_STATE, nothing written", async () => {
    const t = makeT();
    const { jobId, courseId } = await writingJob(t);
    await publish(t, courseId);
    const deck = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(6) });
    expect(deck.status).toBe(400);
    expect(deck.json.error).toMatch(/BAD_STATE/);
    expect((await post(t, "saveTest", { jobId, chapterOrder: 1, questions: questions(8) })).status).toBe(400);
    expect((await post(t, "finishJob", { jobId })).json.error).toMatch(/BAD_STATE/);
    expect(await t.run((ctx) => ctx.db.query("slideDecks").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("chapterTests").collect())).toHaveLength(0);
    expect((await job(t, jobId))?.status).toBe("writing");
  });
});

describe("each field is scanned on its own (no cross-field fence tricks)", () => {
  const evilBody = [
    "See [x](https://evil.example/x).",
    "",
    "```youtube",
    JSON.stringify({ videoId: "aaaaaaaaaaa", title: "T" }),
    "```",
  ].join("\n");
  it.each(["```", "~~~", "<pre>"])("saveSubchapter with title %j still checks the body", async (title) => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const res = await post(t, "saveSubchapter", sub11(jobId, { title, body: evilBody }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Unknown reference: .*https:\/\/evil\.example\/x/);
    expect(res.json.error).toMatch(/youtube:aaaaaaaaaaa/);
    const viaSummary = await post(t, "saveSubchapter", sub11(jobId, { summary: title, body: evilBody }));
    expect(viaSummary.status).toBe(400);
  });
  it("saveDeck: a fence in one bullet does not hide a URL in the next", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const deck = slides(6);
    deck[0] = { ...deck[0], bullets: ["```", "Go to https://evil.example/d"] };
    const res = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: deck });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Unknown reference: https://evil.example/d");
  });
  it("saveTest: a URL in inline code in an option is reported", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const qs = questions(8);
    qs[0] = { ...qs[0], options: ["`https://evil.example/s`", "B", "C"] };
    const res = await post(t, "saveTest", { jobId, chapterOrder: 1, questions: qs });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Unknown reference: https://evil.example/s");
  });
});
