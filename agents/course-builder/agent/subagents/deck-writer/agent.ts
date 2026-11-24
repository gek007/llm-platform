import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// One run writes one chapter's slide deck as structured JSON (the deck schema in
// convex/lib/deck.ts, passed as the turn's `outputSchema`). It has no tools: it never saves
// anything itself. The deck pipeline (lib/generate-deck.ts) validates its answer, sends validation
// errors back into the same conversation, checks the diagrams and saves the deck. Same model and
// effort as the chapter writer. Hidden from the root model (`tool: false`): only the write
// workflow reaches it, via ctx.agent("deck-writer").
export default defineAgent({
  description:
    "Writes the slide deck of one chapter of an AI-generated course as structured JSON, from a deck brief: layouts, bullets, Mermaid diagrams, charts, tables and speaker notes. It never writes HTML.",
  model: anthropic("claude-opus-5-5"),
  reasoning: "high",
  defaultTools: false,
  tool: false,
});
