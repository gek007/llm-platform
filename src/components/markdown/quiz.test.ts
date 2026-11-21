import { describe, expect, test } from "vitest";
import { parseQuiz } from "./quiz";

const valid = {
  question: "What does `as const` do?",
  options: ["A", "B", "C"],
  answer: 1,
  explanation: "Because.",
};

describe("parseQuiz", () => {
  test("accepts a valid quiz", () => {
    expect(parseQuiz(JSON.stringify(valid))).toEqual({ ok: true, quiz: valid });
  });

  test("explanation is optional", () => {
    const { explanation, ...rest } = valid;
    void explanation;
    expect(parseQuiz(JSON.stringify(rest)).ok).toBe(true);
  });

  test("reports invalid JSON instead of throwing", () => {
    const result = parseQuiz("{ nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid JSON/);
  });

  test.each([
    ["missing question", { ...valid, question: "" }, /question/],
    ["fewer than two options", { ...valid, options: ["only"] }, /options/],
    ["answer out of range", { ...valid, answer: 3 }, /answer/],
    ["negative answer", { ...valid, answer: -1 }, /answer/],
    ["non-integer answer", { ...valid, answer: 0.5 }, /answer/],
    ["wrong types", { ...valid, options: "A,B" }, /options/],
  ])("rejects %s", (_name, value, message) => {
    const result = parseQuiz(JSON.stringify(value));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  test("rejects non-object JSON", () => {
    expect(parseQuiz("42").ok).toBe(false);
    expect(parseQuiz("null").ok).toBe(false);
  });
});
