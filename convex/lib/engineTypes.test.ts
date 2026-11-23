/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { LENGTH_PRESETS, MAX_CHAPTERS, MAX_SUBCHAPTERS } from "./engineTypes";

const modules = import.meta.glob(["../**/*.{ts,js}", "!../**/*.test.ts", "!../**/*.d.ts"]);

describe("engine types", () => {
  it("length presets respect the caps", () => {
    for (const preset of Object.values(LENGTH_PRESETS)) {
      expect(preset.chapters).toBeLessThanOrEqual(MAX_CHAPTERS);
      expect(preset.maxSub).toBeLessThanOrEqual(MAX_SUBCHAPTERS);
    }
  });

  it("schema accepts a chaptered course", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const courseId = await ctx.db.insert("courses", {
        slug: "c",
        title: "C",
        summary: "s",
        description: "d",
        level: "beginner",
        tier: "free",
        status: "draft",
        tags: [],
        outcomes: [],
        order: 1,
        language: "he",
      });
      const chapterId = await ctx.db.insert("chapters", {
        courseId,
        slug: "chapter-1",
        title: "Ch",
        summary: "s",
        order: 1,
      });
      await ctx.db.insert("lessons", {
        courseId,
        chapterId,
        slug: "lesson-1-1",
        title: "L",
        summary: "s",
        body: "b",
        order: 1,
        durationMinutes: 5,
        isFreePreview: false,
      });
      await ctx.db.insert("slideDecks", {
        courseId,
        chapterId,
        slides: [{ layout: "bullets", title: "T", bullets: ["a"], notes: "n" }],
        updatedAt: 1,
      });
      await ctx.db.insert("chapterTests", {
        courseId,
        chapterId,
        version: 1,
        passPercent: 70,
        maxAttempts: 3,
        questions: [
          { id: "q1", kind: "true_false", prompt: "?", options: ["True", "False"], correct: [0], explanation: "e" },
        ],
      });
      expect(await ctx.db.query("chapters").collect()).toHaveLength(1);
    });
  });
});
