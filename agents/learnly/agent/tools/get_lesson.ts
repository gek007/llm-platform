import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { viewerClient } from "../lib/viewer";

const MAX_BODY = 12000;

export default defineTool({
  description:
    "Read a lesson's content by course and lesson slug (e.g. the lesson the learner is viewing). Returns the body only when the learner can access it; locked lessons return just the title and summary.",
  inputSchema: z.object({
    courseSlug: z.string().trim().min(1).max(100),
    lessonSlug: z.string().trim().min(1).max(100),
  }),
  label: { start: ({ lessonSlug }) => `Read lesson ${lessonSlug}` },
  async execute({ courseSlug, lessonSlug }, ctx) {
    const viewer = viewerClient(ctx);
    if (!viewer.ok) return { ok: false as const, message: viewer.message };
    const result = await viewer.client.query(api.lessons.getForViewer, { courseSlug, lessonSlug });
    if (!result) return { ok: true as const, found: false as const, message: "Lesson not found." };
    const { lesson, course } = result;
    const nav = { prev: result.prev, next: result.next };
    if (result.locked || !("body" in lesson) || typeof lesson.body !== "string") {
      return {
        ok: true as const,
        found: true as const,
        locked: true as const,
        course: course.title,
        title: lesson.title,
        summary: lesson.summary,
        ...nav,
        message: "This lesson is locked for the learner. Do not describe its content.",
      };
    }
    return {
      ok: true as const,
      found: true as const,
      locked: false as const,
      course: course.title,
      title: lesson.title,
      summary: lesson.summary,
      body: lesson.body.slice(0, MAX_BODY),
      truncated: lesson.body.length > MAX_BODY,
      ...nav,
    };
  },
});
