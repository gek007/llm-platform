import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { MAX_CHAPTERS } from "../../../../convex/lib/engineTypes";
import { chaptersToWrite, loadJob, logProgress, writeChapters } from "../lib/write-chapters";

/**
 * Write phase fan-out: one `chapter-writer` subagent per chapter, all in parallel. Each writer saves
 * its chapter's subchapters, deck and test through the engine and answers with `writerOutputSchema`;
 * one `chapter` progress event is logged per finished writer. Returns `{ ok: true, chapters, failed }`.
 */
export default defineWorkflowTool({
  description:
    "Write chapters of the approved course in parallel: one chapter writer per chapter saves every subchapter, the slide deck and the test. Omit chapterOrders to write every chapter; pass chapterOrders to write only those (to finish chapters that are incomplete). Returns each chapter's report and `failed`: the chapters that still need work, with the reason.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    chapterOrders: z
      .array(z.number().int().min(1))
      .min(1)
      .max(MAX_CHAPTERS)
      .optional()
      .describe("1-based chapter numbers to write. Omit to write every chapter."),
  }),
  label: {
    start: ({ chapterOrders }) =>
      chapterOrders ? `Write chapter${chapterOrders.length > 1 ? "s" : ""} ${chapterOrders.join(", ")}` : "Write every chapter",
  },
  async execute({ jobId, chapterOrders }, ctx) {
    "use workflow";
    const loaded = await loadJob(jobId);
    if (!loaded.ok) return loaded;
    const plan = chaptersToWrite(loaded.job, chapterOrders);
    if (!plan.ok) return plan;
    const n = plan.orders.length;
    await logProgress(jobId, "info", n === 1 ? `Writing chapter ${plan.orders[0]}` : `Writing ${n} chapters in parallel`);
    return writeChapters(ctx, loaded.job, plan.orders);
  },
});
