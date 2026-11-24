import { randomBytes } from "node:crypto";
import { defineEvalConfig } from "eve/evals";
import { dnsCourseJob } from "./lib/dns-course";
import { createFakeEngine, serveFakeEngine, tinyCourseJob } from "./lib/fake-engine";

// Runs before `eve eval` starts the local agent server, which inherits this process's environment:
// the agent's engine client (`engineFromEnv`) then talks to the in-memory fake engines instead of
// Convex. CONVEX_SITE_URL wins over the NEXT_PUBLIC_* URLs in .env.local; the fakes accept any
// bearer token, so a COURSE_ENGINE_SECRET from .env.local works too (it never leaves the machine).
// One server holds one job per eval: `engine` for tiny-course, `deckEngine` for dns-deck.
export default defineEvalConfig({
  timeoutMs: 30 * 60_000,
  async setup() {
    const engine = createFakeEngine(tinyCourseJob());
    const deckEngine = createFakeEngine(dnsCourseJob());
    const server = await serveFakeEngine([engine, deckEngine]);
    process.env.CONVEX_SITE_URL = server.url;
    process.env.COURSE_ENGINE_SECRET ||= randomBytes(32).toString("hex");
    return { engine, deckEngine, server };
  },
  async teardown(context) {
    await context?.server.close();
  },
});
