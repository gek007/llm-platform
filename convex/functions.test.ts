/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { validateQuestion } from "./lib/grading";
import { seedChapteredCourses } from "./lib/seedChapteredData";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);

const issuer = "https://example.clerk.accounts.dev";
const asUser = (t: ReturnType<typeof makeT>, extra: Record<string, unknown> = {}) =>
  t.withIdentity({ subject: "user_1", issuer, name: "Ada", ...extra });
const proClaims = { pla: "u:pro" };
const adminClaims = { metadata: { role: "admin" } };

function makeT() {
  return convexTest(schema, modules);
}

describe("seed + catalog", () => {
  it("seeds idempotently and lists published courses with stats", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    await t.mutation(internal.seed.run, {});
    const list = await t.query(api.courses.listPublished, {});
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.map((c) => c.order)).toEqual([...list.map((c) => c.order)].sort((a, b) => a - b));
    const pro = list.find((c) => c.tier === "pro")!;
    expect(pro.lessonCount).toBeGreaterThan(0);
    expect(pro.previewCount).toBeGreaterThan(0);
    expect(pro.durationMinutes).toBeGreaterThan(0);
  });
});

describe("seed chaptered course", () => {
  it("seeds the Hebrew course idempotently with chapters, decks and tests", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    await t.mutation(internal.seed.run, {});
    await t.run(async (ctx) => {
      const course = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", "digital-safety-basics"))
        .unique();
      expect(course).toMatchObject({ language: "he", tier: "free", status: "published" });
      const chapters = await ctx.db
        .query("chapters")
        .withIndex("by_course_order", (q) => q.eq("courseId", course!._id))
        .collect();
      expect(chapters.map((c) => c.slug)).toEqual(["chapter-1", "chapter-2"]);
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", course!._id))
        .collect();
      expect(lessons.map((l) => l.order)).toEqual([1, 2, 3, 4]);
      expect(lessons.map((l) => l.chapterId)).toEqual([
        chapters[0]._id,
        chapters[0]._id,
        chapters[1]._id,
        chapters[1]._id,
      ]);
      for (const chapter of chapters) {
        const decks = await ctx.db
          .query("slideDecks")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();
        expect(decks).toHaveLength(1);
        expect(decks[0].slides).toHaveLength(6);
        const tests = await ctx.db
          .query("chapterTests")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();
        expect(tests).toHaveLength(1);
        expect(tests[0]).toMatchObject({ version: 1, passPercent: 70, maxAttempts: 3 });
        expect(tests[0].questions).toHaveLength(4);
      }
    });
  });

  it("keeps the test version when re-seeding", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    await t.run(async (ctx) => {
      const test = (await ctx.db.query("chapterTests").first())!;
      await ctx.db.patch(test._id, { version: 5 });
    });
    await t.mutation(internal.seed.run, {});
    await t.run(async (ctx) => {
      const versions = (await ctx.db.query("chapterTests").collect()).map((x) => x.version).sort();
      expect(versions).toEqual([1, 5]);
    });
  });

  it("has only well-formed seed questions and a youtube and quiz block", () => {
    for (const course of seedChapteredCourses) {
      const bodies = course.chapters.flatMap((c) => c.lessons.map((l) => l.body)).join("\n");
      expect(bodies).toContain("```youtube");
      expect(bodies).toContain("```quiz");
      for (const chapter of course.chapters) {
        expect(chapter.slides).toHaveLength(6);
        for (const q of chapter.test.questions) expect(validateQuestion(q)).toBeNull();
      }
    }
  });
});

describe("gating", () => {
  it("never returns body to a signed-out viewer of a pro lesson, but does for a preview", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const locked = await t.query(api.lessons.getForViewer, {
      courseSlug: "react-server-components",
      lessonSlug: "the-client-boundary",
    });
    expect(locked?.locked).toBe(true);
    expect(locked?.lesson).not.toHaveProperty("body");
    expect(locked?.lesson).not.toHaveProperty("muxPlaybackId");

    const preview = await t.query(api.lessons.getForViewer, {
      courseSlug: "react-server-components",
      lessonSlug: "the-mental-model",
    });
    expect(preview?.locked).toBe(false);
    expect(preview?.lesson.body).toContain("```quiz");
    // The playback ID never leaves via getForViewer; video needs a signed token from the action.
    expect(preview?.lesson).not.toHaveProperty("muxPlaybackId");
  });

  it("unlocks pro lessons for pro members via the pla claim and for admins", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const args = { courseSlug: "react-server-components", lessonSlug: "the-client-boundary" };
    const free = await asUser(t).query(api.lessons.getForViewer, args);
    expect(free?.locked).toBe(true);
    const pro = await asUser(t, proClaims).query(api.lessons.getForViewer, args);
    expect(pro?.locked).toBe(false);
    expect(pro?.lesson.body).toBeTruthy();
    const admin = await asUser(t, adminClaims).query(api.lessons.getForViewer, args);
    expect(admin?.locked).toBe(false);
  });

  it("marks outline entries locked per viewer", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const anon = await t.query(api.courses.getBySlug, { slug: "react-server-components" });
    expect(anon?.lessons.filter((l) => l.locked).length).toBeGreaterThan(0);
    expect(anon?.lessons.find((l) => l.isFreePreview)?.locked).toBe(false);
    const pro = await asUser(t, proClaims).query(api.courses.getBySlug, {
      slug: "react-server-components",
    });
    expect(pro?.lessons.every((l) => !l.locked)).toBe(true);
  });
});

describe("enrollment and progress", () => {
  it("requires Pro to enroll in a pro course, and enroll is idempotent for free courses", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const courses = await t.query(api.courses.listPublished, {});
    const proCourse = courses.find((c) => c.tier === "pro")!;
    const freeCourse = courses.find((c) => c.tier === "free")!;

    await expect(
      asUser(t).mutation(api.enrollments.enroll, { courseId: proCourse._id }),
    ).rejects.toThrow(/PRO_REQUIRED/);
    await expect(
      t.mutation(api.enrollments.enroll, { courseId: freeCourse._id }),
    ).rejects.toThrow(/UNAUTHENTICATED/);

    const a = await asUser(t).mutation(api.enrollments.enroll, { courseId: freeCourse._id });
    const b = await asUser(t).mutation(api.enrollments.enroll, { courseId: freeCourse._id });
    expect(a).toEqual(b);
    expect(await asUser(t).query(api.enrollments.isEnrolled, { courseId: freeCourse._id })).toBe(true);
    await asUser(t, proClaims).mutation(api.enrollments.enroll, { courseId: proCourse._id });
  });

  it("listMine leads to a chapter's slides when the learner is about to start that chapter", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const course = (await asUser(t).query(api.courses.getBySlug, { slug: "digital-safety-basics" }))!;
    const [first, second, third] = course.lessons;
    await asUser(t).mutation(api.enrollments.enroll, { courseId: course._id });
    const mine = async () => (await asUser(t).query(api.enrollments.listMine, {}))[0];

    // Nothing done: the course starts with chapter 1's deck.
    expect(await mine()).toMatchObject({ nextLessonSlug: first.slug, nextChapterSlug: "chapter-1" });
    // Mid-chapter: straight to the next lesson.
    await asUser(t).mutation(api.progress.setComplete, { lessonId: first._id, complete: true });
    expect(await mine()).toMatchObject({ nextLessonSlug: second.slug, nextChapterSlug: null });
    // Chapter 1 finished: chapter 2 opens with its deck.
    await asUser(t).mutation(api.progress.setComplete, { lessonId: second._id, complete: true });
    expect(await mine()).toMatchObject({ nextLessonSlug: third.slug, nextChapterSlug: "chapter-2" });
  });

  it("a course without chapters has no chapter to start", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const course = (await t.query(api.courses.getBySlug, { slug: "typescript-foundations" }))!;
    await asUser(t).mutation(api.enrollments.enroll, { courseId: course._id });
    const [mine] = await asUser(t).query(api.enrollments.listMine, {});
    expect(mine.nextChapterSlug).toBeNull();
  });

  it("marks lessons complete, auto-enrolls, reports progress, and blocks locked lessons", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const course = (await t.query(api.courses.getBySlug, { slug: "typescript-foundations" }))!;
    const [first] = course.lessons;

    await asUser(t).mutation(api.progress.setComplete, { lessonId: first._id, complete: true });
    expect(await asUser(t).query(api.progress.forCourse, { courseId: course._id })).toEqual([
      first._id,
    ]);
    const mine = await asUser(t).query(api.enrollments.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ completedCount: 1, lessonCount: course.lessons.length });
    expect(mine[0].nextLessonSlug).toBe(course.lessons[1].slug);

    await asUser(t).mutation(api.progress.setComplete, { lessonId: first._id, complete: false });
    expect(await asUser(t).query(api.progress.forCourse, { courseId: course._id })).toEqual([]);

    const proCourse = (await t.query(api.courses.getBySlug, { slug: "react-server-components" }))!;
    const lockedLesson = proCourse.lessons.find((l) => l.locked)!;
    await expect(
      asUser(t).mutation(api.progress.setComplete, { lessonId: lockedLesson._id, complete: true }),
    ).rejects.toThrow(/LOCKED/);
  });
});

describe("users and viewer", () => {
  it("upserts the user and reports viewer state", async () => {
    const t = makeT();
    expect(await t.query(api.viewer.get, {})).toMatchObject({
      signedIn: false,
      isAdmin: false,
      isPro: false,
      user: null,
    });
    await asUser(t).mutation(api.users.store, { email: "ada@example.com" });
    await asUser(t).mutation(api.users.store, { name: "Ada L" });
    const viewer = await asUser(t, { ...proClaims, ...adminClaims }).query(api.viewer.get, {});
    expect(viewer).toMatchObject({ signedIn: true, isAdmin: true, isPro: true });
    expect(viewer.user).toMatchObject({ clerkId: "user_1", name: "Ada L", email: "ada@example.com" });
  });
});
