import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import agent from "./agent";

describe("Learnly agent configuration", () => {
  test("calls Claude Opus 5.5 directly and disables default shell/file tools", () => {
    const model = agent.model as { provider?: string; modelId?: string };
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toMatch(/anthropic/);
    expect(agent.reasoning).toBe("medium");
    expect(agent.defaultTools).toBe(false);
  });

  test("instructions cover identity, tools, quizzes and locked content", () => {
    const text = readFileSync(resolve(import.meta.dirname, "instructions.md"), "utf8");
    for (const needle of ["Learnly", "AI", "list_courses", "get_course_details", "get_my_progress", "get_lesson", "show_quiz", "locked"]) {
      expect(text).toContain(needle);
    }
  });
});
