import { z } from "zod";

const quizSchema = z
  .object({
    question: z.string().trim().min(1, "question is required"),
    options: z.array(z.string().trim().min(1)).min(2, "needs at least 2 options"),
    answer: z.number().int().min(0),
    explanation: z.string().optional(),
  })
  .refine((q) => q.answer < q.options.length, {
    message: "answer must be the 0-based index of an option",
    path: ["answer"],
  });

export type Quiz = z.infer<typeof quizSchema>;

export type ParsedQuiz = { ok: true; quiz: Quiz } | { ok: false; error: string };

/** Parses the JSON body of a ```quiz block. Never throws. */
export function parseQuiz(json: string): ParsedQuiz {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` };
  }
  const result = quizSchema.safeParse(raw);
  if (result.success) return { ok: true, quiz: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.join(".");
  return { ok: false, error: path ? `${path}: ${issue.message}` : issue.message };
}
