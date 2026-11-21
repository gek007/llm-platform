import { defineTool } from "eve/tools";
import { z } from "zod";

/** Same shape as `parseQuiz` in src/components/markdown/quiz.ts; the chat UI renders this tool's output. */
export const quizInput = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(6),
  answer: z.number().int().min(0).describe("0-based index of the correct option."),
  explanation: z.string().optional().describe("Short explanation shown after the learner checks."),
});

export default defineTool({
  description:
    "Show the learner an interactive multiple-choice quiz question in the chat. Call it once per question, then wait for the learner; do not repeat the question or answer in text.",
  inputSchema: quizInput,
  label: false,
  execute(input) {
    if (input.answer >= input.options.length) {
      return { shown: false as const, error: "answer must be the 0-based index of an option." };
    }
    return { shown: true as const, quiz: input };
  },
});
