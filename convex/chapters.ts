import { query } from "./_generated/server";
import { v } from "convex/values";
import { canAccessCourseContent, canAccessLesson } from "./lib/access";
import { getViewerState } from "./lib/auth";

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
      const attempts = viewer.subject
        ? await ctx.db
            .query("testAttempts")
            .withIndex("by_user_test", (q) =>
              q.eq("userId", viewer.subject!).eq("testId", testRow._id),
            )
            .collect()
        : [];
      const top = attempts.reduce<(typeof attempts)[number] | null>(
        (b, a) => (b === null || a.scorePercent > b.scorePercent ? a : b),
        null,
      );
      test = {
        _id: testRow._id,
        questionCount: testRow.questions.length,
        passPercent: testRow.passPercent,
        maxAttempts: testRow.maxAttempts,
        best: top
          ? { scorePercent: top.scorePercent, passed: attempts.some((a) => a.passed) }
          : null,
        attemptsUsed: attempts.length,
      };
    }

    const ref = (c: (typeof chapters)[number] | undefined) =>
      c ? { slug: c.slug, title: c.title } : null;
    return {
      course: { slug: course.slug, title: course.title, language: course.language ?? "en" },
      chapter: {
        _id: chapter._id,
        slug: chapter.slug,
        title: chapter.title,
        summary: chapter.summary,
        order: chapter.order,
      },
      locked,
      deck: deckRow ? { slides: deckRow.slides } : null,
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
