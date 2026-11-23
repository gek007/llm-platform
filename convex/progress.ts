import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessLesson } from "./lib/access";
import { ensureEnrolled } from "./lib/enrollment";
import { completionFor } from "./lib/completion";
import { getIdentity, getViewerState, requireUser } from "./lib/auth";

export const setComplete = mutation({
  args: { lessonId: v.id("lessons"), complete: v.boolean() },
  handler: async (ctx, { lessonId, complete }) => {
    const identity = await requireUser(ctx);
    const viewer = await getViewerState(ctx);
    const lesson = await ctx.db.get(lessonId);
    const course = lesson ? await ctx.db.get(lesson.courseId) : null;
    if (!lesson || !course || (course.status !== "published" && !viewer.admin)) {
      throw new ConvexError("NOT_FOUND");
    }
    if (!canAccessLesson({ course, lesson, ...viewer })) {
      throw new ConvexError("LOCKED");
    }
    const userId = identity.subject;

    const existing = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", lessonId))
      .unique();

    if (complete) {
      await ensureEnrolled(ctx, userId, course._id);
      if (!existing) {
        await ctx.db.insert("lessonProgress", {
          userId,
          courseId: course._id,
          lessonId,
          completedAt: Date.now(),
        });
      }
    } else if (existing) {
      await ctx.db.delete(existing._id);
    }
    return complete;
  },
});

export const forCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const identity = await getIdentity(ctx);
    if (!identity) return [];
    const rows = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseId", courseId),
      )
      .collect();
    return rows.map((r) => r.lessonId);
  },
});

export const courseCompletion = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const zero = { lessonsDone: 0, lessonCount: 0, testsPassed: 0, testCount: 0, complete: false };
    const identity = await getIdentity(ctx);
    if (!identity) return zero;
    const viewer = await getViewerState(ctx);
    const course = await ctx.db.get(courseId);
    if (!course || (course.status !== "published" && !viewer.admin)) return zero;
    const { lessonsDone, lessonCount, testsPassed, testCount, complete } =
      await completionFor(ctx, identity.subject, courseId);
    return { lessonsDone, lessonCount, testsPassed, testCount, complete };
  },
});
