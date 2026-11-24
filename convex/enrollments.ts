import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { completionFor } from "./lib/completion";
import { chapterToStart } from "./lib/coursePath";
import { getIdentity, getViewerState, requireUser } from "./lib/auth";

export const enroll = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const identity = await requireUser(ctx);
    const viewer = await getViewerState(ctx);
    const course = await ctx.db.get(courseId);
    if (!course || (course.status !== "published" && !viewer.admin)) {
      throw new ConvexError("NOT_FOUND");
    }
    if (course.tier === "pro" && !viewer.pro && !viewer.admin) {
      throw new ConvexError("PRO_REQUIRED");
    }
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseId", courseId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("enrollments", {
      userId: identity.subject,
      courseId,
      enrolledAt: Date.now(),
    });
  },
});

export const isEnrolled = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const identity = await getIdentity(ctx);
    if (!identity) return false;
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseId", courseId),
      )
      .unique();
    return existing !== null;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerState(ctx);
    if (!viewer.subject) return [];
    const userId = viewer.subject;
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const rows = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = await ctx.db.get(enrollment.courseId);
        if (!course || (course.status !== "published" && !viewer.admin)) return null;
        const c = await completionFor(ctx, userId, course._id);
        const { lessons, done } = c;
        const next = lessons.find((l) => !done.has(l._id)) ?? lessons[0];
        // Slides first: when the next lesson starts a chapter that has a deck, the card leads to
        // the chapter page (deck on top) instead of the lesson.
        const chapterRows = await ctx.db
          .query("chapters")
          .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
          .collect();
        const chapters = await Promise.all(
          chapterRows.map(async (chapter) => ({
            slug: chapter.slug,
            lessonIds: lessons.filter((l) => l.chapterId === chapter._id).map((l) => l._id as string),
            hasDeck:
              (await ctx.db
                .query("slideDecks")
                .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
                .first()) !== null,
          })),
        );
        return {
          ...course,
          enrolledAt: enrollment.enrolledAt,
          lessonCount: lessons.length,
          completedCount: c.lessonsDone,
          testsPassed: c.testsPassed,
          testCount: c.testCount,
          complete: c.complete,
          nextLessonSlug: next?.slug ?? null,
          nextChapterSlug: chapterToStart(next?._id, chapters, done as ReadonlySet<string>),
        };
      }),
    );
    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.enrolledAt - a.enrolledAt);
  },
});
