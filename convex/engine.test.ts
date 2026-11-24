/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
type TestSlide = {
  id: string;
  layout: string;
  title: string;
  bullets?: string[];
  visual?: unknown;
  code?: unknown;
  notes: string;
};
/** A deck that passes the deck schema: a title slide, bullets slides, a summary slide. */
const slides = (n: number): TestSlide[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    layout: i === 0 ? "title" : i === n - 1 ? "summary" : "bullets",
    title: `Slide ${i + 1}`,
    ...(i === 0 ? {} : { bullets: ["one", "two"] }),
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
      { order: 1, title: "S1.1", summary: "goal S1.1", hasBody: false },
      { order: 2, title: "S1.2", summary: "goal S1.2", hasBody: false },
    ]);
  });
  it("returns each source's saved excerpt (the chapter writers' only view of it)", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    await post(t, "saveSources", {
      jobId,
      sources: [
        { url: "https://docs.example.com/guide", title: "Guide", kind: "web", excerpt: "RAG retrieves passages first." },
        { url: "https://docs.example.com/faq", title: "FAQ", kind: "web" },
      ],
    });
    const { json } = await post(t, "getJob", { jobId });
    expect(json.sources).toEqual([
      expect.objectContaining({ url: "https://docs.example.com/guide", excerpt: "RAG retrieves passages first." }),
      expect.not.objectContaining({ excerpt: expect.anything() }),
    ]);
    expect((json.sources as Json[])[1]).toMatchObject({ url: "https://docs.example.com/faq", title: "FAQ" });
  });
});

describe("getChapterContent", () => {
  it("needs the secret like every op", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    expect((await post(t, "getChapterContent", { jobId, chapterOrder: 1 }, null)).status).toBe(401);
    expect((await post(t, "getChapterContent", { jobId, chapterOrder: 1 }, "Bearer wrong")).status).toBe(401);
  });
  it("returns the chapter's saved lesson bodies, deck slide titles and test prompts (no answers)", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    await post(t, "saveSubchapter", sub11(jobId, { chapterOrder: 2, subchapterOrder: 1, body: "Body of 2.1" }));
    await post(t, "saveDeck", { jobId, chapterOrder: 2, slides: slides(8) });
    await post(t, "saveTest", { jobId, chapterOrder: 2, questions: questions(8, "Ask") });
    const { status, json } = await post(t, "getChapterContent", { jobId, chapterOrder: 2 });
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      chapterOrder: 2,
      title: "Ch 2",
      lessons: [
        { order: 1, title: "What is RAG", body: "Body of 2.1", truncated: false },
        { order: 2, title: "S2.2", body: "", truncated: false },
      ],
      deckSlideTitles: Array.from({ length: 8 }, (_, i) => `Slide ${i + 1}`),
      testPrompts: Array.from({ length: 8 }, (_, i) => `Ask ${i + 1}?`),
    });
    expect(JSON.stringify(json)).not.toMatch(/correct|explanation|Because A/);
    // Chapter 1 has nothing saved yet.
    const empty = await post(t, "getChapterContent", { jobId, chapterOrder: 1 });
    expect(empty.json).toMatchObject({ deckSlideTitles: [], testPrompts: [] });
  });
  it("caps each body at 12 000 characters and marks it truncated", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    await post(t, "saveSubchapter", sub11(jobId, { body: "x".repeat(20_000) }));
    const { json } = await post(t, "getChapterContent", { jobId, chapterOrder: 1 });
    const lesson = (json.lessons as { body: string; truncated: boolean }[])[0];
    expect(lesson.body).toHaveLength(12_000);
    expect(lesson.truncated).toBe(true);
  });
  it("is scoped to the job's own course: unknown chapter, other job, no course", async () => {
    const t = makeT();
    const a = await writingJob(t);
    const b = await writingJob(t);
    await post(t, "saveSubchapter", sub11(b.jobId, { body: "Only in job B" }));
    const fromA = await post(t, "getChapterContent", { jobId: a.jobId, chapterOrder: 1 });
    expect(JSON.stringify(fromA.json)).not.toContain("Only in job B");
    const missing = await post(t, "getChapterContent", { jobId: a.jobId, chapterOrder: 3 });
    expect(missing).toMatchObject({ status: 400, json: { ok: false, error: "NOT_FOUND: chapter 3" } });
    const early = await researchingJob(t);
    const none = await post(t, "getChapterContent", { jobId: early, chapterOrder: 1 });
    expect(none.status).toBe(400);
    expect(none.json.error).toMatch(/^BAD_STATE/);
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
  it("saveOutline refuses a pasted-text resource in resourceIds with INVALID", async () => {
    const t = makeT();
    const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    const textId = await asAdmin(t).mutation(api.generation.addResource, { jobId, kind: "text", text: "Notes" });
    const urlId = await asAdmin(t).mutation(api.generation.addResource, { jobId, kind: "url", url: "https://example.org/a" });
    await asAdmin(t).mutation(api.generation.startJob, { jobId });
    const place = (ids: string[]) => ({
      chapters: [{ ...outline2x2.chapters[0], subchapters: [{ ...sub("A"), resourceIds: ids }, sub("B")] }, outline2x2.chapters[1]],
    });
    const res = await post(t, "saveOutline", { jobId, outline: place([urlId, textId]) });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(new RegExp(`^INVALID: resource ${textId} is pasted text`));
    expect((await job(t, jobId))?.status).toBe("researching");
    expect((await post(t, "saveOutline", { jobId, outline: place([urlId]) })).status).toBe(200);
  });
  it("reportProgress is accepted in outline_ready (no status change) and refused once ready", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    expect((await post(t, "saveOutline", { jobId, outline: outline2x2 })).status).toBe(200);
    const res = await post(t, "reportProgress", { jobId, kind: "outline", message: "Outline ready: 2 chapters" });
    expect(res.status).toBe(200);
    expect((await job(t, jobId))?.status).toBe("outline_ready");
    expect((await events(t, jobId)).some((e) => e.message === "Outline ready: 2 chapters")).toBe(true);
    await setStatus(t, jobId, "ready");
    expect((await post(t, "reportProgress", { jobId, kind: "error", message: "x" })).json.error).toMatch(/^BAD_STATE/);
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
  it("a ```resource block placing a pasted-text resource is INVALID; nothing is written", async () => {
    const t = makeT();
    const jobId = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    const textId = await asAdmin(t).mutation(api.generation.addResource, { jobId, kind: "text", text: "Notes" });
    await setStatus(t, jobId, "outline_ready", { outline: outline2x2 });
    await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
    const md = ["Intro.", "", "```resource", JSON.stringify({ resourceId: textId }), "```"].join("\n");
    const res = await post(t, "saveSubchapter", sub11(jobId, { body: md }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(new RegExp(`^INVALID: resource ${textId} is pasted text: source material only`));
    const lessons = await t.run((ctx) => ctx.db.query("lessons").collect());
    expect(lessons.every((l) => l.body === "")).toBe(true);
    // Using the text's content without a block is fine.
    expect((await post(t, "saveSubchapter", sub11(jobId, { body: "From the notes: track expenses." }))).status).toBe(200);
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
  it("saveDeck needs 8-15 slides and upserts one row per chapter", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(7) })).status).toBe(400);
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(16) })).status).toBe(400);
    const a = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(8) });
    const b = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(9) });
    expect(a.status).toBe(200);
    expect(a.json.deckId).toBe(b.json.deckId);
    const decks = await t.run((ctx) => ctx.db.query("slideDecks").collect());
    expect(decks).toHaveLength(1);
    expect(decks[0].slides).toHaveLength(9);
  });
  it("saveDeck enforces the deck schema and names the slide in the error", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const save = (deck: TestSlide[]) => post(t, "saveDeck", { jobId, chapterOrder: 1, slides: deck });
    const edit = (i: number, patch: Partial<TestSlide>) => slides(8).map((s, j) => (j === i ? { ...s, ...patch } : s));

    const noTitle = await save(edit(0, { layout: "bullets", bullets: ["one"] }));
    expect(noTitle.status).toBe(400);
    expect(noTitle.json.error).toMatch(/^INVALID: slide 1 \(s1\) layout: the first slide must use the "title" layout/);
    expect((await save(edit(7, { layout: "bullets" }))).json.error).toMatch(/the last slide must use the "summary" layout/);
    expect((await save(edit(3, { id: "s2" }))).json.error).toMatch(/slide 4 \(s2\) id: slide id "s2" is used twice/);
    expect((await save(edit(2, { bullets: ["1", "2", "3", "4", "5", "6"] }))).status).toBe(400);
    const wordy = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
    expect((await save(edit(2, { bullets: [wordy] }))).json.error).toMatch(/slide 3 \(s3\) bullets 1: a bullet has at most 16 words/);
    expect((await save(edit(2, { layout: "visual-full", bullets: undefined }))).json.error).toMatch(/a visual-full slide needs visual/);
    expect(
      (await save(edit(2, { visual: { type: "table", headers: ["A", "B"], rows: [["1", "2"]] } }))).json.error,
    ).toMatch(/a bullets slide does not show visual \(use bullets\+visual or visual-full\)/);
    expect(await t.run((ctx) => ctx.db.query("slideDecks").collect())).toHaveLength(0);
  });
  it("saveDeck stores visuals, code and the deck title, and accepts a deck with few visuals", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const deck = slides(8);
    deck[1] = {
      ...deck[1],
      layout: "bullets+visual",
      visual: { type: "mermaid", code: "flowchart LR\n  A[Ask] --> B[Answer]", caption: "The flow" },
    };
    deck[2] = {
      id: "s3",
      layout: "visual-full",
      title: "Numbers",
      visual: { type: "chart", chartType: "bar", data: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
      notes: "Speaker notes.",
    };
    deck[3] = { id: "s4", layout: "code", title: "Try it", code: { language: "bash", content: "curl https://example.com" }, notes: "Speaker notes." };
    const res = await post(t, "saveDeck", { jobId, chapterOrder: 1, title: "  RAG in pictures ", slides: deck });
    expect(res.status).toBe(200);
    const [row] = await t.run((ctx) => ctx.db.query("slideDecks").collect());
    expect(row.title).toBe("RAG in pictures");
    expect(row.slides[1].visual).toMatchObject({ type: "mermaid", caption: "The flow" });
    expect(row.slides[2].visual).toMatchObject({ type: "chart", chartType: "bar" });
    // A URL inside slide code is allowed, like a code block in a lesson body.
    expect(row.slides[3].code).toEqual({ language: "bash", content: "curl https://example.com" });
    // Without a title the chapter's title is used.
    await post(t, "saveDeck", { jobId, chapterOrder: 2, slides: slides(8) });
    const rows = await t.run((ctx) => ctx.db.query("slideDecks").collect());
    expect(rows.map((r) => r.title).sort()).toEqual(["Ch 2", "RAG in pictures"]);
  });
  it("saveDeck: an unknown URL in a diagram, a caption or a table cell is refused", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    const withVisual = (visual: unknown) => {
      const deck = slides(8);
      deck[1] = { ...deck[1], layout: "bullets+visual", visual };
      return post(t, "saveDeck", { jobId, chapterOrder: 1, slides: deck });
    };
    const inDiagram = await withVisual({ type: "mermaid", code: "flowchart LR\n  A[https://evil.example/m] --> B" });
    expect(inDiagram.json.error).toBe("Unknown reference: https://evil.example/m");
    const inCell = await withVisual({ type: "table", headers: ["A", "B"], rows: [["see https://evil.example/t", "2"]] });
    expect(inCell.json.error).toBe("Unknown reference: https://evil.example/t");
    const click = await withVisual({ type: "mermaid", code: 'flowchart LR\n  A --> B\n  click A "x"' });
    expect(click.json.error).toMatch(/mermaid: click and href are not allowed/);
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
      if (c !== skipDeckFor) await post(t, "saveDeck", { jobId, chapterOrder: c, slides: slides(8) });
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
    const res = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(8) });
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
    expect((await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(8) })).status).toBe(400);
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
    const deck = await post(t, "saveDeck", { jobId, chapterOrder: 1, slides: slides(8) });
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
    const deck = slides(8);
    deck[1] = { ...deck[1], bullets: ["```", "Go to https://evil.example/d"] };
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

describe("failStalledJobs watchdog", () => {
  const MIN = 60_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const run = (t: T) => t.mutation(internal.engine.failStalledJobs, {});

  it("fails a researching job whose last activity is 16 minutes old", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    vi.advanceTimersByTime(16 * MIN);
    await run(t);
    expect(await job(t, jobId)).toMatchObject({ status: "failed", error: "No progress for 15 minutes" });
    const events = await t.run((ctx) =>
      ctx.db.query("generationEvents").withIndex("by_job_at", (q) => q.eq("jobId", jobId)).collect(),
    );
    expect(events.some((e) => e.kind === "error" && e.message === "No progress for 15 minutes")).toBe(true);
  });
  it("fails a stalled writing job", async () => {
    const t = makeT();
    const { jobId } = await writingJob(t);
    vi.advanceTimersByTime(16 * MIN);
    await run(t);
    expect((await job(t, jobId))?.status).toBe("failed");
  });
  it("leaves a job with activity 10 minutes ago unchanged", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    vi.advanceTimersByTime(10 * MIN);
    await run(t);
    expect((await job(t, jobId))?.status).toBe("researching");
  });
  it("a recent event keeps an old-updatedAt job alive", async () => {
    const t = makeT();
    const jobId = await researchingJob(t);
    vi.advanceTimersByTime(14 * MIN);
    await t.run((ctx) =>
      ctx.db.insert("generationEvents", { jobId, at: Date.now(), kind: "info", message: "working" }),
    );
    vi.advanceTimersByTime(10 * MIN);
    await run(t);
    expect((await job(t, jobId))?.status).toBe("researching");
  });
  it("never fails outline_ready, queued or ready jobs", async () => {
    const t = makeT();
    const queued = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    const outlineReady = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    await setStatus(t, outlineReady, "outline_ready", { outline: outline2x2 });
    const ready = await asAdmin(t).mutation(api.generation.createJob, jobArgs);
    await setStatus(t, ready, "ready");
    vi.advanceTimersByTime(60 * MIN);
    await run(t);
    expect((await job(t, queued))?.status).toBe("queued");
    expect((await job(t, outlineReady))?.status).toBe("outline_ready");
    expect((await job(t, ready))?.status).toBe("ready");
  });
});
