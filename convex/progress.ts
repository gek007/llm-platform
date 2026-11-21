import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessLesson } from "./lib/access";
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
      const enrolled = await ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", course._id))
        .unique();
      if (!enrolled) {
        await ctx.db.insert("enrollments", {
          userId,
          courseId: course._id,
          enrolledAt: Date.now(),
        });
      }
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
