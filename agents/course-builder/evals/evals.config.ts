import { randomBytes } from "node:crypto";
import { defineEvalConfig } from "eve/evals";
import { createFakeEngine, serveFakeEngine, tinyCourseJob } from "./lib/fake-engine";

// Runs before `eve eval` starts the local agent server, which inherits this process's environment:
// the agent's engine client (`engineFromEnv`) then talks to the in-memory fake engine instead of
// Convex. CONVEX_SITE_URL wins over the NEXT_PUBLIC_* URLs in .env.local; the fake accepts any
// bearer token, so a COURSE_ENGINE_SECRET from .env.local works too (it never leaves the machine).
export default defineEvalConfig({
  timeoutMs: 30 * 60_000,
  async setup() {
    const engine = createFakeEngine(tinyCourseJob());
    const server = await serveFakeEngine(engine);
    process.env.CONVEX_SITE_URL = server.url;
    process.env.COURSE_ENGINE_SECRET ||= randomBytes(32).toString("hex");
    return { engine, server };
  },
  async teardown(context) {
    await context?.server.close();
  },
});
