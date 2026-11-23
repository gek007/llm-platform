import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../../../lib/engine-client";
import { engineSafe } from "../../../lib/tool-result";

export default defineTool({
  description:
    "Save one subchapter (lesson) of your chapter. Overwrites what is saved there. The body is markdown in the course language with 1-3 ```quiz blocks; links and embeds may use only the brief's sources and resources, or the engine answers 'Unknown reference: X'. Title and summary are plain text (no URLs).",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the brief."),
    chapterOrder: z.number().int().min(1).describe("Your chapter's number from the brief."),
    subchapterOrder: z.number().int().min(1).describe("The subchapter's number within the chapter (2.3 → 3)."),
    title: z.string().trim().min(1).max(300).describe("Plain text, in the course language."),
    summary: z.string().trim().min(1).max(2000).describe("One line, plain text, in the course language."),
    body: z.string().trim().min(1).max(100_000).describe("The lesson in markdown. [n] cites the n-th id in sourceIds."),
    durationMinutes: z.number().int().min(1).max(240).describe("Whole minutes a learner needs for this lesson."),
    sourceIds: z
      .array(z.string().min(1))
      .max(50)
      .describe("IDs of the brief's sources this lesson cites, in [n] order ([1] = first). [] when it cites none."),
  }),
  label: { start: ({ chapterOrder, subchapterOrder }) => `Save subchapter ${chapterOrder}.${subchapterOrder}` },
  async execute(input) {
    return engineSafe(async () => {
      const { lessonId } = await engineFromEnv().saveSubchapter(input);
      return { ok: true as const, chapterOrder: input.chapterOrder, subchapterOrder: input.subchapterOrder, lessonId };
    });
  },
});
