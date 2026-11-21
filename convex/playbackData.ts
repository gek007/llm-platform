import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { playbackIdForViewer } from "./lib/access";
import { userRecordIsPro } from "./lib/auth";

/**
 * Re-runs the lesson access check for the caller of `playback.getLessonTokens`. The action
 * passes the verified identity's claims (an internal query has no auth of its own), and this
 * applies the same rule as `lessons.getForViewer`: `canAccessLesson`, plus the draft-course
 * and "ready video" conditions. Returns the Mux playback ID or null.
 */
export const resolveLessonPlayback = internalQuery({
  args: {
    lessonId: v.id("lessons"),
    subject: v.optional(v.string()),
    admin: v.boolean(),
    proClaim: v.boolean(),
  },
  handler: async (ctx, { lessonId, subject, admin, proClaim }): Promise<string | null> => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;
    const course = await ctx.db.get(lesson.courseId);
    if (!course) return null;
    if (course.status !== "published" && !admin) return null;
    const pro = proClaim || (subject ? await userRecordIsPro(ctx, subject) : false);
    return playbackIdForViewer({ course, lesson, signedIn: Boolean(subject), pro, admin });
  },
});
