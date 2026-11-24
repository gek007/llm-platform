import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { deckDraftSchema, slideSchema, SLIDE_LAYOUTS } from "../../../../../convex/lib/deck";
import agent from "./agent";

describe("deck-writer subagent configuration", () => {
  test("calls Claude Opus 5.5 directly with high reasoning, no tools at all, hidden from the root model", () => {
    const model = agent.model as { provider?: string; modelId?: string };
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toMatch(/anthropic/);
    expect(agent.reasoning).toBe("high");
    expect(agent.defaultTools).toBe(false);
    expect(agent.tool).toBe(false);
    expect(agent.description).toMatch(/slide deck/i);
    // It only answers with JSON: nothing it could save or fetch with.
    expect(existsSync(resolve(import.meta.dirname, "tools"))).toBe(false);
  });

  test("instructions cover the JSON-only contract, every layout, the rules, visuals and corrections", () => {
    const text = readFileSync(resolve(import.meta.dirname, "instructions.md"), "utf8");
    for (const layout of SLIDE_LAYOUTS) expect(text).toContain(`\`${layout}\``);
    for (const needle of [
      "never write HTML",
      "8-15 slides",
      "At least 40%",
      "At most 5 bullets",
      "under 12 words",
      "2-4 sentences",
      "course language",
      "Mermaid source",
      "never an image",
      "`chart`",
      "`table`",
      "`image_prompt`",
      "Never invent data",
      "No URLs",
      "word for word",
      "did not pass validation",
      "return only that one slide",
      "Unknown reference",
    ]) {
      expect(text).toContain(needle);
    }
  });
});

describe("the deck schema as the turn's output schema", () => {
  test("converts to JSON Schema with the layouts and the four visual types", () => {
    type Field = { enum?: string[]; maxItems?: number };
    const schema = z.toJSONSchema(deckDraftSchema) as unknown as {
      required: string[];
      properties: { slides: { minItems: number; maxItems: number; items: { properties: Record<string, Field>; required: string[] } } };
    };
    expect(schema.required).toEqual(["title", "slides"]);
    const { slides } = schema.properties;
    expect([slides.minItems, slides.maxItems]).toEqual([8, 15]);
    expect(slides.items.required).toEqual(["id", "title", "layout", "notes"]);
    expect(slides.items.properties.layout.enum).toEqual([...SLIDE_LAYOUTS]);
    expect(slides.items.properties.bullets.maxItems).toBe(5);
    const visual = JSON.stringify(slides.items.properties.visual);
    for (const type of ["mermaid", "chart", "table", "image_prompt"]) expect(visual).toContain(`"const":"${type}"`);
    // No field can carry markup: the slide has exactly these keys.
    expect(Object.keys(slides.items.properties).sort()).toEqual(
      ["attribution", "bullets", "code", "id", "layout", "left", "notes", "quote", "right", "title", "visual"].sort(),
    );
  });

  test("the single-slide schema used for diagram repairs converts too", () => {
    const schema = z.toJSONSchema(slideSchema) as unknown as { required: string[] };
    expect(schema.required).toEqual(["id", "title", "layout", "notes"]);
  });
});
