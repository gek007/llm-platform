import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../../../lib/engine-client";
import { engineSafe } from "../../../lib/tool-result";

// Mirrors `slideValidator` (convex/lib/engineTypes.ts); the engine checks each layout's fields.
const text = z.string().trim().min(1).max(2000);
const slide = z.object({
  layout: z
    .enum(["title", "bullets", "two-column", "quote", "summary"])
    .describe("title: title only; bullets and summary need bullets; two-column needs left and right; quote needs quote."),
  title: text,
  bullets: z.array(text).optional(),
  left: z.array(text).optional(),
  right: z.array(text).optional(),
  quote: text.optional(),
  attribution: text.optional(),
  notes: z.string().trim().min(1).max(4000).describe("Speaker notes: 2-4 sentences, the narration for this slide."),
});

export default defineTool({
  description:
    "Save your chapter's slide deck: 6-12 slides with varied layouts, every one with speaker notes of 2-4 sentences. Replaces the chapter's deck. All strings are plain text in the course language; never put a URL in a slide.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the brief."),
    chapterOrder: z.number().int().min(1).describe("Your chapter's number from the brief."),
    slides: z.array(slide).min(6).max(12),
  }),
  label: { start: ({ chapterOrder, slides }) => `Save the slide deck for chapter ${chapterOrder} (${slides.length} slides)` },
  async execute(input) {
    return engineSafe(async () => {
      const { deckId } = await engineFromEnv().saveDeck(input);
      return { ok: true as const, chapterOrder: input.chapterOrder, deckId, slides: input.slides.length };
    });
  },
});
