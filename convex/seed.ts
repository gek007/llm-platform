import { internalMutation } from "./_generated/server";
import { seedCourses } from "./lib/seedData";
import { seedChapteredCourses } from "./lib/seedChapteredData";
import { TEST_DEFAULTS } from "./lib/engineTypes";

/** Idempotent: upserts courses and lessons by slug. Run: npx convex run seed:run */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let order = 0;
    for (const { lessons, ...data } of seedCourses) {
      order += 1;
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", data.slug))
        .unique();
      const fields = { ...data, status: "published" as const, order };
      const courseId = existing ? existing._id : await ctx.db.insert("courses", fields);
      if (existing) await ctx.db.patch(courseId, fields);

      let lessonOrder = 0;
      for (const lesson of lessons) {
        lessonOrder += 1;
        const found = await ctx.db
          .query("lessons")
          .withIndex("by_course_slug", (q) => q.eq("courseId", courseId).eq("slug", lesson.slug))
          .unique();
        if (found) await ctx.db.patch(found._id, { ...lesson, order: lessonOrder });
        else await ctx.db.insert("lessons", { ...lesson, courseId, order: lessonOrder });
      }
    }

    for (const { chapters, ...data } of seedChapteredCourses) {
      order += 1;
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", data.slug))
        .unique();
      const fields = { ...data, status: "published" as const, order };
      const courseId = existing ? existing._id : await ctx.db.insert("courses", fields);
      if (existing) await ctx.db.patch(courseId, fields);

      let lessonOrder = 0;
      let chapterOrder = 0;
      for (const { lessons, slides, test, ...chapter } of chapters) {
        chapterOrder += 1;
        const foundChapter = await ctx.db
          .query("chapters")
          .withIndex("by_course_slug", (q) => q.eq("courseId", courseId).eq("slug", chapter.slug))
          .unique();
        const chapterFields = { ...chapter, order: chapterOrder };
        const chapterId = foundChapter
          ? foundChapter._id
          : await ctx.db.insert("chapters", { ...chapterFields, courseId });
        if (foundChapter) await ctx.db.patch(chapterId, chapterFields);

        for (const lesson of lessons) {
          lessonOrder += 1;
          const found = await ctx.db
            .query("lessons")
            .withIndex("by_course_slug", (q) => q.eq("courseId", courseId).eq("slug", lesson.slug))
            .unique();
          const lessonFields = { ...lesson, order: lessonOrder, chapterId };
          if (found) await ctx.db.patch(found._id, lessonFields);
          else await ctx.db.insert("lessons", { ...lessonFields, courseId });
        }

        const deck = await ctx.db
          .query("slideDecks")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
          .unique();
        if (deck) await ctx.db.patch(deck._id, { slides, updatedAt: Date.now() });
        else await ctx.db.insert("slideDecks", { courseId, chapterId, slides, updatedAt: Date.now() });

        const foundTest = await ctx.db
          .query("chapterTests")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
          .unique();
        if (foundTest) await ctx.db.patch(foundTest._id, { questions: test.questions });
        else {
          await ctx.db.insert("chapterTests", {
            courseId,
            chapterId,
            version: 1,
            ...TEST_DEFAULTS,
            questions: test.questions,
          });
        }
      }
    }
    return { courses: seedCourses.length + seedChapteredCourses.length };
  },
});
