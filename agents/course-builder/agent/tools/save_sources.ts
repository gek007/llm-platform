import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { engineSafe } from "../lib/tool-result";

export default defineTool({
  description:
    "Save sources you actually used: only pages you fetched (read_resource, web_fetch) or that web_search returned in this job, and admin URL/YouTube resources. Upserts by URL; returns each source's id for later citations. 1-50 per call.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    sources: z
      .array(
        z.object({
          url: z.string().trim().min(1).max(2000).describe("Absolute http(s) URL exactly as fetched or returned by search."),
          title: z.string().trim().min(1).max(300).describe("The page's real title."),
          kind: z.enum(["web", "pdf", "youtube", "text"]),
          resourceId: z.string().min(1).optional().describe("Set when the source is one of the admin's resources."),
          excerpt: z.string().max(5000).optional().describe("Key facts or a short quote you relied on, for the chapter writers."),
        }),
      )
      .min(1)
      .max(50),
  }),
  label: { start: ({ sources }) => `Save ${sources.length} source(s)` },
  async execute(input) {
    return engineSafe(async () => ({ ok: true as const, ...(await engineFromEnv().saveSources(input)) }));
  },
});
