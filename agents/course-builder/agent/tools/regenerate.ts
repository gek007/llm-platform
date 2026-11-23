import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { chapterInstructionSection, onlyRedoSection, savedContentSection, targetName } from "../lib/regenerate";
import {
  chaptersToWrite,
  loadChapterContent,
  loadJob,
  logProgress,
  runWriter,
  writeChapters,
} from "../lib/write-chapters";

/**
 * Regenerate one item for the admin. `chapter` → the write fan-out for that one chapter, with the
 * instruction; `subchapter` / `deck` / `test` → one chapter-writer run with the chapter's brief plus
 * "Only redo <target>: <instruction>" and the chapter's saved content (lesson bodies, deck titles,
 * test prompts; engine `getChapterContent`), so the writer saves only that item and grounds it in
 * what learners already read. The first write never loads saved content. The route moved the job
 * ready → writing before dispatching; the agent calls `finish_job` afterwards (back to ready).
 */
export default defineWorkflowTool({
  description:
    "Regenerate one item of the written course, following the admin's instruction: a subchapter, a chapter's slide deck or test, or a whole chapter. Pass the command's target and instruction unchanged. Only that item is rewritten; call finish_job afterwards.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    target: z.object({
      kind: z.enum(["subchapter", "deck", "test", "chapter"]),
      chapterOrder: z.number().int().min(1),
      subchapterOrder: z.number().int().min(1).optional().describe("Required when kind is subchapter."),
    }),
    instruction: z.string().max(4000).describe("The admin's instruction from the command, unchanged."),
  }),
  label: {
    start: ({ target }) =>
      `Regenerate the ${target.kind} (${target.subchapterOrder ? `${target.chapterOrder}.${target.subchapterOrder}` : `chapter ${target.chapterOrder}`})`,
  },
  async execute({ jobId, target, instruction }, ctx) {
    "use workflow";
    const loaded = await loadJob(jobId);
    if (!loaded.ok) return loaded;
    const job = loaded.job;
    const plan = chaptersToWrite(job, [target.chapterOrder]);
    if (!plan.ok) return plan;
    const chapter = job.course!.chapters.find((c) => c.order === target.chapterOrder)!;

    if (target.kind === "chapter") {
      await logProgress(jobId, "info", `Regenerating chapter ${chapter.order}`, chapter.order);
      const summary = await writeChapters(ctx, job, [chapter.order], chapterInstructionSection(instruction));
      return { ...summary, target, redone: summary.failed.length === 0 };
    }

    if (target.kind === "subchapter" && !chapter.subchapters.some((s) => s.order === target.subchapterOrder)) {
      return {
        ok: false as const,
        message:
          target.subchapterOrder === undefined
            ? "INVALID: target.subchapterOrder is required for a subchapter"
            : `INVALID: chapter ${chapter.order} has no subchapter ${target.subchapterOrder}`,
      };
    }

    const saved = await loadChapterContent(jobId, chapter.order);
    if (!saved.ok) return saved;
    const name = targetName(target, chapter);
    await logProgress(jobId, "info", `Regenerating ${name}`, chapter.order);
    const extra = `${onlyRedoSection(target, chapter, instruction)}\n\n${savedContentSection(target, saved.content)}`;
    const run = await runWriter(ctx, job, chapter.order, extra);
    if (!run.ok) {
      const message = `Regenerating ${name} failed: ${run.failure.reason}`;
      await logProgress(jobId, "chapter", message, chapter.order);
      return { ok: false as const, message };
    }
    const { saved: report, problems } = run.result;
    const redone = target.kind === "deck" ? report.deck : target.kind === "test" ? report.test : report.subchapters >= 1;
    const issues = problems.length > 0 ? `: ${problems.join("; ")}` : "";
    const outcome = !redone
      ? `Regenerating ${name} did not save it${issues}`
      : issues
        ? `Regenerated ${name} with problems${issues}`
        : `Regenerated ${name}`;
    await logProgress(jobId, "chapter", outcome, chapter.order);
    return { ok: true as const, target, redone, saved: report, problems };
  },
});
