import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { attemptSummary } from "./testAttempts";

/**
 * Course completion: every lesson complete AND every chapter test passed.
 * A test passed under any earlier version still counts. A course with no lessons
 * is never complete. Flat courses (no tests) are complete when all lessons are done.
 */
export async function completionFor(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userId: string,
  courseId: Id<"courses">,
) {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
    .collect();
  const progress = await ctx.db
    .query("lessonProgress")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  const done = new Set(progress.map((p) => p.lessonId));
  const tests = await ctx.db
    .query("chapterTests")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  const passedFlags = await Promise.all(
    tests.map(async (t) => (await attemptSummary(ctx, userId, t._id)).best?.passed === true),
  );
  const lessonsDone = lessons.filter((l) => done.has(l._id)).length;
  const testsPassed = passedFlags.filter(Boolean).length;
  return {
    lessons,
    done,
    lessonsDone,
    lessonCount: lessons.length,
    testsPassed,
    testCount: tests.length,
    complete:
      lessons.length > 0 && lessonsDone === lessons.length && testsPassed === tests.length,
  };
}
