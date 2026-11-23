import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// Direct Anthropic API (reads ANTHROPIC_API_KEY), not the Vercel AI Gateway. Same model as Learnly;
// "high" effort because research and course structure reward deliberate thinking (turns run in the
// background, so latency matters less than in Learnly's chat). No default shell/file tools: the
// agent works only through its own tools and the Convex /engine/* API.
export default defineAgent({
  model: anthropic("claude-opus-5-5"),
  reasoning: "high",
  defaultTools: false,
});
