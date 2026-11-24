import type { RegenerateTarget } from "./command";
import type { ChapterContent, JobBrief } from "./engine-client";

/**
 * Text the `regenerate` tool appends to a writer brief (lib/writer-brief.ts). Pure.
 */

type Chapter = NonNullable<JobBrief["course"]>["chapters"][number];

/** How the target reads in the writer's message and in progress lines. */
export function targetName(target: RegenerateTarget, chapter: Chapter): string {
  if (target.kind === "deck") return `the slide deck of chapter ${chapter.order}`;
  if (target.kind === "test") return `the test of chapter ${chapter.order}`;
  if (target.kind === "chapter") return `chapter ${chapter.order}`;
  const lesson = chapter.subchapters.find((s) => s.order === target.subchapterOrder);
  return `subchapter ${chapter.order}.${target.subchapterOrder}${lesson ? ` "${lesson.title}"` : ""}`;
}

function instructionText(instruction: string): string {
  return instruction.trim() || "(no instruction from the admin: write it again to a higher standard, following the rules)";
}

/**
 * The section appended to the writer brief for a single-item regenerate of a subchapter or the
 * test. (A deck regenerate does not use the chapter writer: see `runDeck` and lib/deck-brief.ts.)
 */
export function onlyRedoSection(target: RegenerateTarget, chapter: Chapter, instruction: string): string {
  const name = targetName(target, chapter);
  const tool =
    target.kind === "test" ? "`save_test`" : `\`save_subchapter\` (subchapterOrder ${target.subchapterOrder})`;
  return [
    "## Regenerate one item",
    "",
    `Only redo ${name}: ${instructionText(instruction)}`,
    "",
    `This is a regenerate. Rewrite only ${name}, following the admin's instruction and the rules above, and save it with ${tool}. Save nothing else: the other subchapters and the test stay as they are. In your report count only what you saved.`,
  ].join("\n");
}

/**
 * The chapter's saved content, appended to a single-item regenerate brief so the rewrite fits what
 * learners already read: every saved lesson body (the target subchapter marked as the item being
 * rewritten, the others "do not rewrite: context only"), then the deck's slide titles and the
 * test's question prompts. Bodies arrive capped by the engine (`truncated`).
 */
export function savedContentSection(target: RegenerateTarget, content: ChapterContent): string {
  const n = content.chapterOrder;
  const grounding =
    target.kind === "test"
      ? "Every question must be answerable from these saved lesson bodies; do not ask about anything they do not teach."
      : "Keep the rewritten subchapter consistent with its neighbours: no repeats, no contradictions, the same terms.";
  const out = [`## Saved content of chapter ${n}`, "", `This is what learners read now. ${grounding}`];
  for (const lesson of content.lessons) {
    const role =
      target.kind === "subchapter" && lesson.order === target.subchapterOrder
        ? "saved version of the item you rewrite"
        : "do not rewrite: context only";
    const body = lesson.body.trim() ? lesson.body : "(no body saved yet)";
    out.push("", `### Subchapter ${n}.${lesson.order} "${lesson.title}" (${role})`, "", body);
    if (lesson.truncated) out.push("", "[Truncated: the saved body is longer.]");
  }
  if (content.deckSlideTitles.length > 0) {
    out.push("", "### Slide deck (titles, context only)", "", ...content.deckSlideTitles.map((t) => `- ${t}`));
  }
  if (content.testPrompts.length > 0) {
    const heading = target.kind === "test" ? "Current test (prompts of the version you replace)" : "Test (question prompts, context only)";
    out.push("", `### ${heading}`, "", ...content.testPrompts.map((p) => `- ${p}`));
  }
  return out.join("\n");
}

/** The section appended to the writer brief when a whole chapter is regenerated. */
export function chapterInstructionSection(instruction: string): string {
  return [
    "## Regenerate the chapter",
    "",
    `Rewrite the whole chapter (every subchapter and the test), following the admin's instruction: ${instructionText(instruction)}`,
    "",
    "The slide deck is rebuilt from your new lessons afterwards, by a separate step.",
  ].join("\n");
}
