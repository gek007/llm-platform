import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import type { Question } from "./engineTypes";
import { gradeTest, publicQuestions, validateQuestion } from "./grading";

const q = (id: string, correct: number[], kind: Question["kind"] = "single", n = 4): Question => ({
  id,
  kind,
  prompt: `Prompt ${id}`,
  options: Array.from({ length: n }, (_, i) => `opt ${i}`),
  correct,
  explanation: "because",
});

describe("gradeTest", () => {
  it("grades a single correct answer as 100 and passed", () => {
    const r = gradeTest([q("a", [1])], { a: [1] }, 70);
    expect(r).toEqual({ scorePercent: 100, passed: true, results: [{ id: "a", correct: true }] });
  });

  it("is all-or-nothing for multiple", () => {
    const r = gradeTest([q("a", [0, 1], "multiple")], { a: [0] }, 70);
    expect(r.results[0].correct).toBe(false);
    expect(r.scorePercent).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("ignores answer order and duplicates", () => {
    const r = gradeTest([q("a", [0, 2], "multiple")], { a: [2, 0, 2] }, 70);
    expect(r.results[0].correct).toBe(true);
  });

  it("counts a missing answer as wrong", () => {
    const r = gradeTest([q("a", [0]), q("b", [0])], { a: [0] }, 70);
    expect(r.results).toEqual([
      { id: "a", correct: true },
      { id: "b", correct: false },
    ]);
    expect(r.scorePercent).toBe(50);
  });

  it("passes at 7/10 and fails at 6/10 with threshold 70", () => {
    const qs = Array.from({ length: 10 }, (_, i) => q(`q${i}`, [0]));
    const answers = (n: number) =>
      Object.fromEntries(qs.map((x, i) => [x.id, [i < n ? 0 : 1]]));
    expect(gradeTest(qs, answers(7), 70).passed).toBe(true);
    expect(gradeTest(qs, answers(6), 70).passed).toBe(false);
  });

  it("rounds scorePercent to an integer", () => {
    const qs = [q("a", [0]), q("b", [0]), q("c", [0])];
    expect(gradeTest(qs, { a: [0] }, 70).scorePercent).toBe(33);
    expect(gradeTest(qs, { a: [0], b: [0] }, 70).scorePercent).toBe(67);
  });

  it("throws INVALID_ANSWERS for an out-of-range index", () => {
    expect(() => gradeTest([q("a", [0])], { a: [5] }, 70)).toThrow(new ConvexError("INVALID_ANSWERS"));
    expect(() => gradeTest([q("a", [0])], { a: [-1] }, 70)).toThrow(ConvexError);
  });

  it("throws INVALID_ANSWERS for non-array or non-integer answers", () => {
    const bad = (v: unknown) =>
      gradeTest([q("a", [0])], { a: v as number[] }, 70);
    expect(() => bad(1)).toThrow(ConvexError);
    expect(() => bad("0")).toThrow(ConvexError);
    expect(() => bad([0.5])).toThrow(ConvexError);
    expect(() => bad(["0"])).toThrow(ConvexError);
  });

  it("ignores answers for unknown question ids", () => {
    const r = gradeTest([q("a", [0])], { a: [0], zzz: [99] }, 70);
    expect(r.scorePercent).toBe(100);
  });

  it("scores an empty question list as 0 and not passed", () => {
    expect(gradeTest([], {}, 70)).toEqual({ scorePercent: 0, passed: false, results: [] });
  });
});

describe("publicQuestions", () => {
  it("strips correct and explanation", () => {
    const [p] = publicQuestions([q("a", [1])]);
    expect(p).not.toHaveProperty("correct");
    expect(p).not.toHaveProperty("explanation");
    expect(Object.keys(p).sort()).toEqual(["id", "kind", "options", "prompt"]);
  });
});

describe("validateQuestion", () => {
  it("accepts valid questions", () => {
    expect(validateQuestion(q("a", [0]))).toBeNull();
    expect(validateQuestion(q("a", [0, 1], "multiple"))).toBeNull();
    expect(validateQuestion(q("a", [1], "true_false", 2))).toBeNull();
  });

  it("rejects bad correct counts", () => {
    expect(validateQuestion(q("a", [0, 1]))).toEqual(expect.any(String));
    expect(validateQuestion(q("a", []))).toEqual(expect.any(String));
    expect(validateQuestion(q("a", [], "multiple"))).toEqual(expect.any(String));
    expect(validateQuestion(q("a", [0, 1], "true_false", 2))).toEqual(expect.any(String));
  });

  it("rejects wrong option counts", () => {
    expect(validateQuestion(q("a", [0], "true_false", 3))).toEqual(expect.any(String));
    expect(validateQuestion(q("a", [0], "single", 1))).toEqual(expect.any(String));
  });

  it("rejects out-of-range or duplicate correct indexes", () => {
    expect(validateQuestion(q("a", [4]))).toEqual(expect.any(String));
    expect(validateQuestion(q("a", [1, 1], "multiple"))).toEqual(expect.any(String));
  });
});
