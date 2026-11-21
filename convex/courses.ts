import { query } from "./_generated/server";
import { v } from "convex/values";
import { canAccessLesson } from "./lib/access";
import { getViewerState } from "./lib/auth";

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .collect();
    return await Promise.all(
      courses.map(async (course) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
          .collect();
        return {
          ...course,
          lessonCount: lessons.length,
          durationMinutes: lessons.reduce((sum, l) => sum + l.durationMinutes, 0),
          previewCount: lessons.filter((l) => l.isFreePreview).length,
        };
      }),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!course) return null;
    const viewer = await getViewerState(ctx);
    if (course.status !== "published" && !viewer.admin) return null;
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();
    return {
      ...course,
      lessons: lessons.map((lesson) => ({
        _id: lesson._id,
        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        order: lesson.order,
        durationMinutes: lesson.durationMinutes,
        isFreePreview: lesson.isFreePreview,
        hasVideo: Boolean(lesson.muxPlaybackId),
        locked: !canAccessLesson({ course, lesson, ...viewer }),
      })),
    };
  },
});
