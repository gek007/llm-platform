import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../../../lib/engine-client";
import { engineSafe } from "../../../lib/tool-result";

// Mirrors `questionValidator` (convex/lib/engineTypes.ts); the engine runs `validateQuestion`.
const text = z.string().trim().min(1).max(2000);
const question = z.object({
  id: z.string().trim().min(1).max(100).describe("Unique within the test, e.g. q1."),
  kind: z
    .enum(["single", "multiple", "true_false"])
    .describe("single: exactly 1 correct; multiple: 1 or more correct (all-or-nothing); true_false: the 2 localized True/False options, exactly 1 correct."),
  prompt: text,
  options: z.array(text).min(2).describe("At least 2; true_false exactly the brief's 2 localized labels, True first."),
  correct: z.array(z.number().int().min(0)).min(1).describe("0-based indexes of the correct options."),
  explanation: text.describe("Why the answer is right, shown after submission."),
});

export default defineTool({
  description:
    "Save your chapter's test: 8-10 questions, every one answerable from this chapter's subchapters, mixing single, multiple and true_false. Replaces the chapter's test. All strings are plain text in the course language; never put a URL in a question.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the brief."),
    chapterOrder: z.number().int().min(1).describe("Your chapter's number from the brief."),
    questions: z.array(question).min(8).max(10),
  }),
  label: { start: ({ chapterOrder, questions }) => `Save the test for chapter ${chapterOrder} (${questions.length} questions)` },
  async execute(input) {
    return engineSafe(async () => {
      const { testId, version } = await engineFromEnv().saveTest(input);
      return { ok: true as const, chapterOrder: input.chapterOrder, testId, version, questions: input.questions.length };
    });
  },
});
