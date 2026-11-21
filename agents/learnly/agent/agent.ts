import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// Direct Anthropic API (reads ANTHROPIC_API_KEY), not the Vercel AI Gateway.
// Claude Opus 5.5 always thinks; "medium" is its default effort and keeps chat replies responsive.
// Don't use "none": disabling thinking is rejected on this model.
export default defineAgent({
  model: anthropic("claude-opus-5-5"),
  reasoning: "medium",
  defaultTools: false,
});
