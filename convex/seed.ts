import { internalMutation } from "./_generated/server";
import { seedCourses } from "./lib/seedData";

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
    return { courses: seedCourses.length };
  },
});
