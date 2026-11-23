import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFromEnv } from "../lib/engine-client";
import { storageUrlProblem } from "../lib/storage-url";
import { engineSafe } from "../lib/tool-result";

export default defineTool({
  description:
    "Save sources you actually used: only public pages you fetched (read_resource, web_fetch) or that web_search returned in this job, and admin URL/YouTube resources. Never an admin PDF's file URL or pasted text: those are placed with resourceIds in the outline. Upserts by URL; returns each source's id for later citations. 1-50 per call.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    sources: z
      .array(
        z.object({
          url: z.string().trim().min(1).max(2000).describe("Absolute http(s) URL exactly as fetched or returned by search."),
          title: z.string().trim().min(1).max(300).describe("The page's real title."),
          kind: z.enum(["web", "pdf", "youtube", "text"]),
          resourceId: z.string().min(1).optional().describe("Set when the source is one of the admin's URL or YouTube resources."),
          excerpt: z.string().max(5000).optional().describe("Key facts or a short quote you relied on, for the chapter writers."),
        }),
      )
      .min(1)
      .max(50),
  }),
  label: { start: ({ sources }) => `Save ${sources.length} source(s)` },
  async execute(input) {
    return engineSafe(async () => {
      const engine = engineFromEnv();
      // Sources are listed under lessons as public links, but an admin PDF lives in access-checked
      // Convex storage (learners reach it through a ```resource block), so its storage URL must
      // never become a source.
      const job = await engine.getJob({ jobId: input.jobId });
      const fileUrls = job.resources.flatMap((r) => (r.fileUrl ? [r.fileUrl] : []));
      for (const s of input.sources) {
        const problem = storageUrlProblem(s.url, fileUrls);
        if (problem) return { ok: false as const, message: `INVALID: ${problem}` };
      }
      return { ok: true as const, ...(await engine.saveSources(input)) };
    });
  },
});
