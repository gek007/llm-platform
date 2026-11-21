import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { errorMessage, insertQuizBlock, isKebabCase, slugify } from "./admin-utils";
import { parseQuiz } from "@/components/markdown/quiz";

describe("admin utils", () => {
  it("slugifies and validates kebab-case", () => {
    expect(slugify("  Hello, World! 2 ")).toBe("hello-world-2");
    expect(isKebabCase("hello-world")).toBe(true);
    expect(isKebabCase("Hello")).toBe(false);
  });

  it("maps Convex errors to messages", () => {
    expect(errorMessage(new ConvexError("SLUG_TAKEN"))).toMatch(/already in use/);
    expect(errorMessage(new Error("[Request ID] Server Error Uncaught ConvexError: FORBIDDEN"))).toMatch(/admin/);
    expect(errorMessage(new Error("boom"))).toMatch(/Something went wrong/);
  });

  it("inserts a valid quiz block", () => {
    const out = insertQuizBlock("# Title\n");
    const json = out.split("```quiz\n")[1].split("\n```")[0];
    expect(parseQuiz(json).ok).toBe(true);
    expect(out.startsWith("# Title\n\n```quiz")).toBe(true);
  });
});
