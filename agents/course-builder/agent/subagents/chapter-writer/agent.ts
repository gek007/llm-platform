import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// One run writes one chapter (subchapters, slide deck, test) from the brief the write fan-out sends
// (lib/writer-brief.ts) and answers with `writerOutputSchema`. Same model and effort as the root
// (the spec wants one model for both). Hidden from the root model (`tool: false`): only the
// write workflow tool reaches it, via ctx.agent("chapter-writer"). Inherits nothing from the root.
export default defineAgent({
  description:
    "Writes one chapter of an AI-generated course from a writer brief: every subchapter lesson, the slide deck and the chapter test, saved through the course engine.",
  model: anthropic("claude-opus-5-5"),
  reasoning: "high",
  defaultTools: false,
  tool: false,
});
