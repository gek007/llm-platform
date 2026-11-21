import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import agent from "./agent";

describe("Learnly agent configuration", () => {
  test("configures a gateway model and disables default shell/file tools", () => {
    expect(agent.model).toBe("openai/gpt-6-luna-fast");
    expect(agent.reasoning).toBe("high");
    expect(agent.defaultTools).toBe(false);
  });

  test("instructions cover identity, tools, quizzes and locked content", () => {
    const text = readFileSync(resolve(import.meta.dirname, "instructions.md"), "utf8");
    for (const needle of ["Learnly", "AI", "list_courses", "get_course_details", "get_my_progress", "get_lesson", "show_quiz", "locked"]) {
      expect(text).toContain(needle);
    }
  });
});
