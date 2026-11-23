import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { engineSafe } from "../lib/tool-result";
import { missingFromRefusal } from "../lib/write-chapters";

/**
 * Ends the write (or regenerate) phase: engine `finishJob` moves the job writing → ready, or refuses
 * with "INCOMPLETE: Chapter 2: deck missing; …". The refusal comes back as `{ ok: false, message,
 * missing, chapterOrders }` so the agent can write those chapters again (once) and finish again.
 */
export default defineTool({
  description:
    "Finish the job after writing or regenerating: the platform checks that every chapter has lessons with a body, a slide deck and a test, then marks the course ready for the admin's review. If something is missing it refuses and returns `missing` (one line per gap) and `chapterOrders` (the chapters to write again).",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
  }),
  label: { start: () => "Finish the job" },
  async execute({ jobId }) {
    const result = await engineSafe(async () => {
      await engineFromEnv().finishJob({ jobId });
      return { ok: true as const, status: "ready" as const };
    });
    return result.ok ? result : { ...result, ...missingFromRefusal(result.message) };
  },
});
