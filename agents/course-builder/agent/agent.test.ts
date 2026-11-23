import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import agent from "./agent";

describe("course-builder agent configuration", () => {
  test("calls Claude Opus 5.5 directly with high reasoning and no default shell/file tools", () => {
    const model = agent.model as { provider?: string; modelId?: string };
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toMatch(/anthropic/);
    expect(agent.reasoning).toBe("high");
    expect(agent.defaultTools).toBe(false);
  });

  test("instructions cover the phases, language rules, source integrity and engine rules", () => {
    const text = readFileSync(resolve(import.meta.dirname, "instructions.md"), "utf8");
    for (const needle of [
      "get_job",
      "jobId",
      "research",
      "write",
      "regenerate",
      "Hebrew",
      "Russian",
      "save_sources",
      "Unknown reference",
      "```resource",
      "6-12",
      "8-10",
      // research phase (Task 18)
      "read_resource",
      "youtube_info",
      "web_search",
      "web_fetch",
      "save_outline",
      "report_progress",
      "primary and official sources",
      "course language",
      "Always write a useful excerpt",
      // write and regenerate phases (Task 20)
      "write_course",
      "chapterOrders",
      "finish_job",
      "once more",
      "Always call `finish_job` afterwards",
      "kind `error`",
    ]) {
      expect(text).toContain(needle);
    }
  });
});
