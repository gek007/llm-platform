import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv, type EngineClient } from "./engine-client";
import { engineSafe } from "./tool-result";

/**
 * The one `report_progress` tool, shared by the root agent (`tools/report_progress.ts`) and the
 * chapter-writer subagent (its own `tools/report_progress.ts`), so both log progress the same way.
 * Each call writes a `generationEvents` row: the admin's live view shows it and the watchdog
 * counts it as liveness (no event for 15 minutes fails the job).
 */
export function makeReportProgressTool(getEngine: () => EngineClient = engineFromEnv) {
  return defineTool({
    description:
      "Log a progress event on the job's live view (also keeps the job alive: no progress for 15 minutes fails it). Use kind 'source' after reading a resource or saving sources, 'outline' after saving the outline, 'chapter' with chapterOrder for chapter work, 'error' for a problem you cannot fix, 'info' otherwise. One short sentence.",
    inputSchema: z.object({
      jobId: z.string().min(1).describe("The jobId from the command."),
      kind: z.enum(["info", "source", "outline", "chapter", "error"]),
      message: z.string().trim().min(1).max(2000).describe("One short sentence for the admin."),
      chapterOrder: z.number().int().min(1).optional().describe("1-based chapter number, for chapter events."),
    }),
    label: { start: ({ message }) => message },
    async execute(input) {
      return engineSafe(async () => {
        await getEngine().reportProgress(input);
        return { ok: true as const };
      });
    },
  });
}
