import { query } from "./_generated/server";
import { v } from "convex/values";
import { canAccessLesson } from "./lib/access";
import { getViewerState } from "./lib/auth";

export const getForViewer = query({
  args: { courseSlug: v.string(), lessonSlug: v.string() },
  handler: async (ctx, { courseSlug, lessonSlug }) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", courseSlug))
      .unique();
    if (!course) return null;
    const viewer = await getViewerState(ctx);
    if (course.status !== "published" && !viewer.admin) return null;

    const all = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();
    const index = all.findIndex((l) => l.slug === lessonSlug);
    if (index === -1) return null;
    const lesson = all[index];
    const locked = !canAccessLesson({ course, lesson, ...viewer });

    const { body, muxPlaybackId, muxUploadId, muxAssetId, ...rest } = lesson;
    void muxUploadId;
    void muxAssetId;
    const publicLesson = {
      ...rest,
      hasVideo: Boolean(muxPlaybackId),
      // The body only ever leaves the server for authorized viewers. The playback ID never does:
      // video is signed, and tokens come from `playback.getLessonTokens` after the same check.
      ...(locked ? {} : { body }),
    };
    const ref = (l: (typeof all)[number] | undefined) =>
      l
        ? {
            slug: l.slug,
            title: l.title,
            locked: !canAccessLesson({ course, lesson: l, ...viewer }),
          }
        : null;
    return {
      course,
      lesson: publicLesson,
      locked,
      prev: ref(all[index - 1]),
      next: ref(all[index + 1]),
    };
  },
});
