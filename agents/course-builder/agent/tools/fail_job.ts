import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { engineSafe } from "../lib/tool-result";

/**
 * Job-level failure: engine `failJob` sets the job `failed` with the cause, so the admin's live view
 * shows it at once and offers **Retry phase** (instead of waiting for the watchdog's generic stall).
 */
export default defineTool({
  description:
    "Mark the job failed when you cannot finish the command: give the real cause in one or two sentences (for example the engine's refusal message). The admin sees it and can retry the phase. Use it only as the last step, then stop.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    error: z.string().trim().min(1).max(2000).describe("The real cause, for the admin."),
  }),
  label: { start: () => "Mark the job failed" },
  async execute({ jobId, error }) {
    return engineSafe(async () => {
      await engineFromEnv().failJob({ jobId, error });
      return { ok: true as const, status: "failed" as const };
    });
  },
});
