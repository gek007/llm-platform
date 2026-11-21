import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { viewerClient } from "../lib/viewer";

export default defineTool({
  description:
    "Get a published course's outline by slug: description, outcomes and ordered lessons with titles, summaries, minutes and whether each is locked for this learner.",
  inputSchema: z.object({
    slug: z.string().trim().min(1).max(100).describe("Course slug, e.g. 'typescript-foundations'."),
  }),
  label: { start: ({ slug }) => `Inspect course ${slug}` },
  async execute({ slug }, ctx) {
    const viewer = viewerClient(ctx);
    if (!viewer.ok) return { ok: false as const, message: viewer.message };
    const course = await viewer.client.query(api.courses.getBySlug, { slug });
    if (!course || course.status !== "published") {
      return { ok: true as const, found: false as const, slug, message: `No published course found with slug "${slug}".` };
    }
    return {
      ok: true as const,
      found: true as const,
      course: {
        slug: course.slug,
        title: course.title,
        summary: course.summary,
        description: course.description,
        level: course.level,
        tier: course.tier,
        tags: course.tags,
        outcomes: course.outcomes,
        lessons: course.lessons.map((l) => ({
          order: l.order,
          slug: l.slug,
          title: l.title,
          summary: l.summary,
          durationMinutes: l.durationMinutes,
          isFreePreview: l.isFreePreview,
          locked: l.locked,
        })),
      },
    };
  },
});
