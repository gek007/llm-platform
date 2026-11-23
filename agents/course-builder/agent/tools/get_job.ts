import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { engineSafe } from "../lib/tool-result";

export default defineTool({
  description:
    "Load everything about a job: status, brief (topic, language, level, length, audience, notes), the admin's resources with their read status, saved sources, the outline and the course written so far. Call it first for every command.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command's json block."),
  }),
  label: { start: () => "Load the job" },
  async execute({ jobId }) {
    return engineSafe(async () => ({ ok: true as const, job: await engineFromEnv().getJob({ jobId }) }));
  },
});
