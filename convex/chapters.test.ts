/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const asUser = (t: ReturnType<typeof makeT>) =>
  t.withIdentity({ subject: "user_1", issuer, name: "Ada" });
const asAdmin = (t: ReturnType<typeof makeT>) =>
  t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });
const makeT = () => convexTest(schema, modules);

async function seed(
  t: ReturnType<typeof makeT>,
  opts: { tier: "free" | "pro"; status: "draft" | "published" },
) {
  return await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      slug: "c",
      title: "C",
      summary: "s",
      description: "d",
      level: "beginner",
      tier: opts.tier,
      status: opts.status,
      tags: [],
      outcomes: [],
      order: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      createdBy: "admin_1",
      topic: "x",
      language: "en",
      level: "beginner",
      length: "short",
      status: "ready",
      createdAt: 0,
      updatedAt: 0,
    });
    const sourceId = await ctx.db.insert("generationSources", {
      jobId,
      url: "https://example.com/a",
      title: "Src A",
      kind: "web",
    });
    const ch1 = await ctx.db.insert("chapters", {
      courseId, slug: "ch-1", title: "One", summary: "s1", order: 1,
    });
    const ch2 = await ctx.db.insert("chapters", {
      courseId, slug: "ch-2", title: "Two", summary: "s2", order: 2,
    });
    const lesson = (slug: string, order: number, chapterId: typeof ch1, extra = {}) =>
      ctx.db.insert("lessons", {
        courseId, slug, title: slug, summary: "", body: "b", order,
        durationMinutes: 5, isFreePreview: false, chapterId, ...extra,
      });
    await lesson("l1", 1, ch1, { sourceIds: [sourceId] });
    await lesson("l2", 2, ch1);
    await lesson("l3", 3, ch2);
    await ctx.db.insert("slideDecks", {
      courseId,
      chapterId: ch1,
      slides: [{ layout: "title", title: "Hello", notes: "n" }],
      updatedAt: 0,
    });
    const testId = await ctx.db.insert("chapterTests", {
      courseId,
      chapterId: ch1,
      version: 2,
      passPercent: 70,
      maxAttempts: 3,
      questions: [
        { id: "q1", kind: "true_false", prompt: "p", options: ["T", "F"], correct: [0], explanation: "e" },
      ],
    });
    return { courseId, ch1, testId };
  });
}

const args = { courseSlug: "c", chapterSlug: "ch-1" };

describe("chapters.getForViewer", () => {
  it("hides draft chapters from learners but shows them to admins", async () => {
    const t = makeT();
    await seed(t, { tier: "free", status: "draft" });
    expect(await asUser(t).query(api.chapters.getForViewer, args)).toBeNull();
    const res = await asAdmin(t).query(api.chapters.getForViewer, args);
    expect(res?.locked).toBe(false);
    expect(res?.deck?.slides).toHaveLength(1);
  });

  it("locks a pro chapter for a free user and withholds the deck", async () => {
    const t = makeT();
    await seed(t, { tier: "pro", status: "published" });
    const res = await asUser(t).query(api.chapters.getForViewer, args);
    expect(res?.locked).toBe(true);
    expect(res?.deck).toBeNull();
    expect(res?.lessons.every((l) => l.locked)).toBe(true);
  });

  it("locks a free chapter when signed out, opens it when signed in", async () => {
    const t = makeT();
    await seed(t, { tier: "free", status: "published" });
    const out = await t.query(api.chapters.getForViewer, args);
    expect(out?.locked).toBe(true);
    expect(out?.deck).toBeNull();
    expect(out?.test?.best).toBeNull();
    expect(out?.test?.attemptsUsed).toBe(0);
    const res = await asUser(t).query(api.chapters.getForViewer, args);
    expect(res?.locked).toBe(false);
    expect(res?.deck?.slides[0].title).toBe("Hello");
    expect(res?.prev).toBeNull();
    expect(res?.next).toEqual({ slug: "ch-2", title: "Two" });
    expect(res?.lessons.map((l) => l.slug)).toEqual(["l1", "l2"]);
    expect(res?.test).toMatchObject({ questionCount: 1, passPercent: 70, maxAttempts: 3 });
    expect(JSON.stringify(res)).not.toContain("explanation");
  });

  it("returns the deck as { chapterId, title, slides }: an older deck gets slide ids and the chapter's title", async () => {
    const t = makeT();
    const { ch1 } = await seed(t, { tier: "free", status: "published" });
    const res = await asUser(t).query(api.chapters.getForViewer, args);
    // The seeded deck was saved before ids and deck titles existed.
    expect(res?.deck).toEqual({
      chapterId: ch1,
      title: "One",
      slides: [{ id: "slide-1", layout: "title", title: "Hello", notes: "n" }],
      updatedAt: 0,
    });
    await t.run(async (ctx) => {
      const deck = await ctx.db.query("slideDecks").first();
      await ctx.db.patch(deck!._id, {
        title: "A deck of its own",
        updatedAt: 5,
        slides: [
          { id: "intro", layout: "title", title: "Hello", notes: "n" },
          {
            id: "flow",
            layout: "visual-full",
            title: "Flow",
            visual: { type: "mermaid", code: "flowchart LR\n  A --> B" },
            notes: "n",
          },
        ],
      });
    });
    const next = await asUser(t).query(api.chapters.getForViewer, args);
    expect(next?.deck).toMatchObject({ title: "A deck of its own", updatedAt: 5 });
    expect(next?.deck?.slides.map((s) => s.id)).toEqual(["intro", "flow"]);
    expect(next?.deck?.slides[1].visual).toEqual({ type: "mermaid", code: "flowchart LR\n  A --> B" });
  });

  it("lists the course's chapters for the sidebar, with whether each has slides", async () => {
    const t = makeT();
    await seed(t, { tier: "free", status: "published" });
    const expected = [
      { slug: "ch-1", title: "One", order: 1, hasDeck: true },
      { slug: "ch-2", title: "Two", order: 2, hasDeck: false },
    ];
    expect((await asUser(t).query(api.chapters.getForViewer, args))?.chapters).toEqual(expected);
    // Also for a locked viewer: the outline is public, the deck is not.
    const out = await t.query(api.chapters.getForViewer, { ...args, chapterSlug: "ch-2" });
    expect(out?.chapters).toEqual(expected);
    expect(out?.deck).toBeNull();
  });

  it("tells an admin how the course's generation is going; learners never see it", async () => {
    const t = makeT();
    const { courseId } = await seed(t, { tier: "free", status: "published" });
    // A hand-made course has no generation.
    expect((await asAdmin(t).query(api.chapters.getForViewer, args))?.generation).toBeNull();
    const jobId = await t.run(async (ctx) => {
      const job = await ctx.db.query("generationJobs").first();
      await ctx.db.patch(courseId, { generationJobId: job!._id });
      return job!._id;
    });
    expect((await asAdmin(t).query(api.chapters.getForViewer, args))?.generation).toEqual({ jobId, status: "ready", error: null });
    await t.run((ctx) => ctx.db.patch(jobId, { status: "failed", error: "No progress for 15 minutes" }));
    expect((await asAdmin(t).query(api.chapters.getForViewer, args))?.generation).toEqual({
      jobId,
      status: "failed",
      error: "No progress for 15 minutes",
    });
    expect((await asUser(t).query(api.chapters.getForViewer, args))?.generation).toBeNull();
    expect((await t.query(api.chapters.getForViewer, args))?.generation).toBeNull();
  });

  it("reports best attempt and attempts used across versions", async () => {
    const t = makeT();
    const { courseId, testId } = await seed(t, { tier: "free", status: "published" });
    await t.run(async (ctx) => {
      const base = { userId: "user_1", courseId, testId, answers: [], submittedAt: 0 };
      await ctx.db.insert("testAttempts", { ...base, testVersion: 1, scorePercent: 80, passed: true });
      await ctx.db.insert("testAttempts", { ...base, testVersion: 2, scorePercent: 40, passed: false });
      await ctx.db.insert("testAttempts", { ...base, userId: "other", testVersion: 2, scorePercent: 100, passed: true });
    });
    const res = await asUser(t).query(api.chapters.getForViewer, args);
    expect(res?.test?.attemptsUsed).toBe(2);
    expect(res?.test?.best).toEqual({ scorePercent: 80, passed: true });
  });
});

describe("course and lesson queries with chapters", () => {
  it("getBySlug lists chapters with lessonIds, deck and test flags; flat courses get []", async () => {
    const t = makeT();
    const { testId } = await seed(t, { tier: "free", status: "published" });
    const res = await t.query(api.courses.getBySlug, { slug: "c" });
    expect(res?.language).toBe("en");
    expect(res?.chapters).toHaveLength(2);
    expect(res?.chapters[0]).toMatchObject({
      slug: "ch-1", hasDeck: true, test: { _id: testId, questionCount: 1 },
    });
    expect(res?.chapters[0].lessonIds).toHaveLength(2);
    expect(res?.chapters[1]).toMatchObject({ hasDeck: false, test: null });

    await t.run((ctx) =>
      ctx.db.insert("courses", {
        slug: "flat", title: "F", summary: "", description: "", level: "beginner",
        tier: "free", status: "published", tags: [], outcomes: [], order: 2,
      }),
    );
    const flat = await t.query(api.courses.getBySlug, { slug: "flat" });
    expect(flat?.chapters).toEqual([]);
  });

  it("lessons.getForViewer resolves sources and chapter, only when unlocked", async () => {
    const t = makeT();
    await seed(t, { tier: "free", status: "published" });
    const a = { courseSlug: "c", lessonSlug: "l1" };
    const res = await asUser(t).query(api.lessons.getForViewer, a);
    expect(res?.sources).toEqual([{ title: "Src A", url: "https://example.com/a", kind: "web" }]);
    expect(res?.chapter).toEqual({ slug: "ch-1", title: "One" });
    expect(res?.language).toBe("en");
    const out = await t.query(api.lessons.getForViewer, a);
    expect(out?.sources).toEqual([]);
  });
});
