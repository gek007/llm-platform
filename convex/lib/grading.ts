import { ConvexError } from "convex/values";
import type { PublicQuestion, Question } from "./engineTypes";

function normalize(answer: unknown, optionCount: number): number[] {
  if (!Array.isArray(answer)) throw new ConvexError("INVALID_ANSWERS");
  for (const i of answer) {
    if (!Number.isInteger(i) || i < 0 || i >= optionCount) {
      throw new ConvexError("INVALID_ANSWERS");
    }
  }
  return [...new Set(answer as number[])].sort((a, b) => a - b);
}

/**
 * Grades a submission. Missing answer = wrong; malformed answer throws
 * ConvexError("INVALID_ANSWERS"); answers for unknown question ids are ignored.
 * An empty question list scores 0 and is not passed.
 */
export function gradeTest(
  questions: Question[],
  answers: Record<string, number[]>,
  passPercent: number,
): { scorePercent: number; passed: boolean; results: { id: string; correct: boolean }[] } {
  const results = questions.map((question) => {
    const given = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
    if (given === undefined) return { id: question.id, correct: false };
    const chosen = normalize(given, question.options.length);
    const expected = [...new Set(question.correct)].sort((a, b) => a - b);
    const correct = chosen.length === expected.length && chosen.every((v, i) => v === expected[i]);
    return { id: question.id, correct };
  });
  const right = results.filter((r) => r.correct).length;
  const scorePercent = questions.length === 0 ? 0 : Math.round((right / questions.length) * 100);
  return { scorePercent, passed: questions.length > 0 && scorePercent >= passPercent, results };
}

export function publicQuestions(questions: Question[]): PublicQuestion[] {
  return questions.map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options }));
}

/** Returns a human-readable error, or null when the question is well formed. */
export function validateQuestion(q: Question): string | null {
  if (q.kind === "true_false") {
    if (q.options.length !== 2) return "True/false questions need exactly 2 options";
  } else if (q.options.length < 2) {
    return "Questions need at least 2 options";
  }
  if (q.correct.some((i) => !Number.isInteger(i) || i < 0 || i >= q.options.length)) {
    return "Correct answers must be valid option indexes";
  }
  if (new Set(q.correct).size !== q.correct.length) return "Correct answers must be unique";
  if (q.kind === "multiple") {
    if (q.correct.length < 1) return "Multiple-choice questions need at least 1 correct answer";
  } else if (q.correct.length !== 1) {
    return "Single and true/false questions need exactly 1 correct answer";
  }
  return null;
}
