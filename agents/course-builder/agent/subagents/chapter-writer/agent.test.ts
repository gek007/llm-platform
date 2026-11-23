import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import agent from "./agent";

describe("chapter-writer subagent configuration", () => {
  test("calls Claude Opus 5.5 directly with high reasoning, no default tools, hidden from the root model", () => {
    const model = agent.model as { provider?: string; modelId?: string };
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toMatch(/anthropic/);
    expect(agent.reasoning).toBe("high");
    expect(agent.defaultTools).toBe(false);
    expect(agent.tool).toBe(false);
    expect(agent.description).toMatch(/chapter/i);
  });

  test("instructions cover language, citations, embeds, quiz/slide/test rules, retries and the report", () => {
    const text = readFileSync(resolve(import.meta.dirname, "instructions.md"), "utf8");
    for (const needle of [
      "course language",
      "proper nouns",
      "save_subchapter",
      "save_deck",
      "save_test",
      "report_progress",
      "sourceIds",
      "[n]",
      "```quiz",
      "```youtube",
      "```resource",
      "1-3",
      "6-12",
      "2-4 sentences",
      "8-10",
      "True/False",
      "Unknown reference",
      "raw URLs",
      "pasted text",
      "2 retries",
      "problems",
      "word for word",
      "never attribute a specific figure or quote",
    ]) {
      expect(text).toContain(needle);
    }
  });
});
