import { webSearch } from "eve/tools/web_search";

// eve's built-in web_search, re-enabled (the agent sets `defaultTools: false`). `provider` applies
// only to AI Gateway models; the direct Anthropic model always gets Anthropic's native web search.
export default webSearch({ provider: "native" });
