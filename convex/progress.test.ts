/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;
const asUser = (t: T) => t.withIdentity({ subject: "user_1", issuer, name: "u" });

async function seed(t: T, opts: { tests: number; lessons?: number }) {
  return await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      slug: "c", title: "C", summary: "s", description: "d", level: "beginner",
      tier: "free", status: "published", tags: [], outcomes: [], order: 1,
    });
    const lessonIds = [];
    for (let i = 0; i < (opts.lessons ?? 2); i++) {
      lessonIds.push(
        await ctx.db.insert("lessons", {
          courseId, slug: `l${i}`, title: `L${i}`, summary: "s", body: "b", order: i + 1,
          durationMinutes: 1, isFreePreview: true,
        }),
      );
    }
    const testIds = [];
    for (let i = 0; i < opts.tests; i++) {
      const chapterId = await ctx.db.insert("chapters", {
        courseId, slug: `ch-${i}`, title: "T", summary: "s", order: i + 1,
      });
      testIds.push(
        await ctx.db.insert("chapterTests", {
          courseId, chapterId, version: 2, passPercent: 70, maxAttempts: 3, questions: [],
        }),
      );
    }
    return { courseId, lessonIds, testIds };
  });
}

const completeLessons = (t: T, courseId: never, ids: never[]) =>
  t.run(async (ctx) => {
    for (const lessonId of ids) {
      await ctx.db.insert("lessonProgress", { userId: "user_1", courseId, lessonId, completedAt: 1 });
    }
  });
const attempt = (t: T, courseId: never, testId: never, passed: boolean, testVersion = 2) =>
  t.run(async (ctx) => {
    await ctx.db.insert("testAttempts", {
      userId: "user_1", courseId, testId, testVersion, answers: [],
      scorePercent: passed ? 100 : 0, passed, submittedAt: 1,
    });
  });

describe("progress.courseCompletion", () => {
  it("is zeros and not complete when signed out", async () => {
    const t = makeT();
    const { courseId } = await seed(t, { tests: 1 });
    expect(await t.query(api.progress.courseCompletion, { courseId })).toEqual({
      lessonsDone: 0, lessonCount: 0, testsPassed: 0, testCount: 0, complete: false,
    });
  });

  it("is incomplete when all lessons are done but a test is unpassed", async () => {
    const t = makeT();
    const s = await seed(t, { tests: 2 });
    await completeLessons(t, s.courseId as never, s.lessonIds as never[]);
    await attempt(t, s.courseId as never, s.testIds[0] as never, true);
    await attempt(t, s.courseId as never, s.testIds[1] as never, false);
    const r = await asUser(t).query(api.progress.courseCompletion, { courseId: s.courseId });
    expect(r).toEqual({ lessonsDone: 2, lessonCount: 2, testsPassed: 1, testCount: 2, complete: false });
  });

  it("is complete when all lessons are done and all tests passed (older version counts)", async () => {
    const t = makeT();
    const s = await seed(t, { tests: 1 });
    await completeLessons(t, s.courseId as never, s.lessonIds as never[]);
    await attempt(t, s.courseId as never, s.testIds[0] as never, true, 1);
    const r = await asUser(t).query(api.progress.courseCompletion, { courseId: s.courseId });
    expect(r.complete).toBe(true);
    const mine = await asUser(t).mutation(api.enrollments.enroll, { courseId: s.courseId });
    expect(mine).toBeTruthy();
    const [row] = await asUser(t).query(api.enrollments.listMine, {});
    expect(row).toMatchObject({ testsPassed: 1, testCount: 1, complete: true, completedCount: 2 });
  });

  it("is incomplete when tests are passed but a lesson is not done", async () => {
    const t = makeT();
    const s = await seed(t, { tests: 1 });
    await completeLessons(t, s.courseId as never, [s.lessonIds[0]] as never[]);
    await attempt(t, s.courseId as never, s.testIds[0] as never, true);
    const r = await asUser(t).query(api.progress.courseCompletion, { courseId: s.courseId });
    expect(r.complete).toBe(false);
  });

  it("flat course (no tests) is complete when lessons are done", async () => {
    const t = makeT();
    const s = await seed(t, { tests: 0 });
    await completeLessons(t, s.courseId as never, s.lessonIds as never[]);
    const r = await asUser(t).query(api.progress.courseCompletion, { courseId: s.courseId });
    expect(r).toEqual({ lessonsDone: 2, lessonCount: 2, testsPassed: 0, testCount: 0, complete: true });
  });

  it("a course with no lessons is never complete", async () => {
    const t = makeT();
    const s = await seed(t, { tests: 0, lessons: 0 });
    const r = await asUser(t).query(api.progress.courseCompletion, { courseId: s.courseId });
    expect(r.complete).toBe(false);
  });
});
