import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { outlineProblem } from "../lib/outline";
import { engineSafe } from "../lib/tool-result";

const item = {
  title: z.string().trim().min(1).max(300).describe("In the course language."),
  goal: z.string().trim().min(1).max(2000).describe("One line, in the course language: what the learner will be able to do."),
};

export default defineTool({
  description:
    "Save the course outline (ends the research phase; the admin then reviews it). The chapter and subchapter counts must match the job's length preset: short = 3 chapters × 2-3 subchapters, medium = 5 × 3, long = 8 × 3-4. Titles and goals in the course language. Use resourceIds to place admin resources in subchapters.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    outline: z.object({
      chapters: z.array(
        z.object({
          ...item,
          subchapters: z.array(
            z.object({
              ...item,
              resourceIds: z.array(z.string().min(1)).optional().describe("IDs of admin resources that belong in this subchapter."),
            }),
          ),
        }),
      ),
    }),
  }),
  label: { start: ({ outline }) => `Save an outline of ${outline.chapters.length} chapters` },
  async execute({ jobId, outline }) {
    return engineSafe(async () => {
      const engine = engineFromEnv();
      const { length } = await engine.getJob({ jobId });
      const problem = outlineProblem(outline, length);
      if (problem) return { ok: false as const, message: `INVALID: ${problem}` };
      await engine.saveOutline({ jobId, outline });
      return { ok: true as const, chapters: outline.chapters.length };
    });
  },
});
