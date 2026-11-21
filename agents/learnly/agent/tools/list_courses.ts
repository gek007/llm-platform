import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { viewerClient } from "../lib/viewer";

export default defineTool({
  description:
    "List every published course in the catalog with level, tier (free or pro), lesson count and total minutes.",
  inputSchema: z.object({}),
  label: { start: () => "Browse the course catalog" },
  async execute(_input, ctx) {
    const viewer = viewerClient(ctx);
    if (!viewer.ok) return { ok: false as const, message: viewer.message };
    const courses = await viewer.client.query(api.courses.listPublished, {});
    return {
      ok: true as const,
      courses: courses.map((c) => ({
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        level: c.level,
        tier: c.tier,
        tags: c.tags,
        lessonCount: c.lessonCount,
        durationMinutes: c.durationMinutes,
      })),
    };
  },
});
