import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { canAccessCourseContent, canAccessLesson } from "./lib/access";
import { getViewerState } from "./lib/auth";
import { withSlideIds } from "./lib/deck";
import type { JobStatus } from "./lib/engineTypes";
import { attemptSummary } from "./lib/testAttempts";

export const getForViewer = query({
  args: { courseSlug: v.string(), chapterSlug: v.string() },
  handler: async (ctx, { courseSlug, chapterSlug }) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", courseSlug))
      .unique();
    if (!course) return null;
    const viewer = await getViewerState(ctx);
    if (course.status !== "published" && !viewer.admin) return null;

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();
    const index = chapters.findIndex((c) => c.slug === chapterSlug);
    if (index === -1) return null;
    const chapter = chapters[index];
    const locked = !canAccessCourseContent({ course, ...viewer });

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_chapter_order", (q) => q.eq("chapterId", chapter._id))
      .collect();

    const deckRow = locked
      ? null
      : await ctx.db
          .query("slideDecks")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .first();

    const testRow = await ctx.db
      .query("chapterTests")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .first();
    let test = null;
    if (testRow) {
      const { best, attemptsUsed } = viewer.subject
        ? await attemptSummary(ctx, viewer.subject, testRow._id)
        : { best: null, attemptsUsed: 0 };
      test = {
        _id: testRow._id,
        questionCount: testRow.questions.length,
        passPercent: testRow.passPercent,
        maxAttempts: testRow.maxAttempts,
        best,
        attemptsUsed,
      };
    }

    // For the chapter sidebar: every chapter of the course, and whether it has slides.
    const outline = await Promise.all(
      chapters.map(async (c) => ({
        slug: c.slug,
        title: c.title,
        order: c.order,
        hasDeck:
          c._id === chapter._id && deckRow
            ? true
            : (await ctx.db
                .query("slideDecks")
                .withIndex("by_chapter", (q) => q.eq("chapterId", c._id))
                .first()) !== null,
      })),
    );

    // Admins see how the course's generation is going, so a missing deck reads as "generating",
    // "failed" or "ready but missing" instead of just "no slides".
    let generation: { jobId: Id<"generationJobs">; status: JobStatus; error: string | null } | null = null;
    if (viewer.admin && course.generationJobId) {
      const job = await ctx.db.get(course.generationJobId);
      if (job) generation = { jobId: job._id, status: job.status, error: job.error ?? null };
    }

    const ref = (c: (typeof chapters)[number] | undefined) =>
      c ? { slug: c.slug, title: c.title } : null;
    return {
      course: { slug: course.slug, title: course.title, language: course.language ?? "en" },
      chapters: outline,
      generation,
      chapter: {
        _id: chapter._id,
        slug: chapter.slug,
        title: chapter.title,
        summary: chapter.summary,
        order: chapter.order,
      },
      locked,
      // The deck as the viewer takes it: `{ chapterId, title, slides }`, every slide with an id
      // (decks saved before ids existed get them here). `updatedAt` tells a regenerated deck apart.
      deck: deckRow
        ? {
            chapterId: chapter._id,
            title: deckRow.title ?? chapter.title,
            slides: withSlideIds(deckRow.slides),
            updatedAt: deckRow.updatedAt,
          }
        : null,
      lessons: lessons.map((l) => ({
        slug: l.slug,
        title: l.title,
        locked: !canAccessLesson({ course, lesson: l, ...viewer }),
      })),
      test,
      prev: ref(chapters[index - 1]),
      next: ref(chapters[index + 1]),
    };
  },
});
