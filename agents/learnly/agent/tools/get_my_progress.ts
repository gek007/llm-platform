import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { viewerClient } from "../lib/viewer";

export default defineTool({
  description:
    "Get the signed-in learner's enrolled courses with completed lessons, remaining lessons and the next lesson to take. Use it to personalise recommendations and to avoid suggesting courses they already did.",
  inputSchema: z.object({}),
  label: { start: () => "Check your progress" },
  async execute(_input, ctx) {
    const viewer = viewerClient(ctx);
    if (!viewer.ok) return { ok: false as const, message: viewer.message };
    const enrolled = await viewer.client.query(api.enrollments.listMine, {});
    const courses = await Promise.all(
      enrolled.map(async (course) => {
        const [detail, doneIds] = await Promise.all([
          viewer.client.query(api.courses.getBySlug, { slug: course.slug }),
          viewer.client.query(api.progress.forCourse, { courseId: course._id }),
        ]);
        const done = new Set<string>(doneIds);
        const lessons = detail?.lessons ?? [];
        return {
          slug: course.slug,
          title: course.title,
          tier: course.tier,
          lessonCount: course.lessonCount,
          completedCount: course.completedCount,
          finished: course.lessonCount > 0 && course.completedCount >= course.lessonCount,
          nextLessonSlug: course.nextLessonSlug,
          completedLessons: lessons.filter((l) => done.has(l._id)).map((l) => ({ slug: l.slug, title: l.title })),
          remainingLessons: lessons.filter((l) => !done.has(l._id)).map((l) => ({ slug: l.slug, title: l.title })),
        };
      }),
    );
    return { ok: true as const, courses };
  },
});
