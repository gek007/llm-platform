import type { RegenerateTarget } from "./command";
import type { JobBrief } from "./engine-client";

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

/** The section appended to the writer brief for a single-item regenerate (subchapter, deck or test). */
export function onlyRedoSection(target: RegenerateTarget, chapter: Chapter, instruction: string): string {
  const name = targetName(target, chapter);
  const tool =
    target.kind === "deck"
      ? "`save_deck`"
      : target.kind === "test"
        ? "`save_test`"
        : `\`save_subchapter\` (subchapterOrder ${target.subchapterOrder})`;
  return [
    "## Regenerate one item",
    "",
    `Only redo ${name}: ${instructionText(instruction)}`,
    "",
    `This is a regenerate. Rewrite only ${name}, following the admin's instruction and the rules above, and save it with ${tool}. Save nothing else: the other subchapters, the slide deck and the test stay as they are. In your report count only what you saved.`,
  ].join("\n");
}

/** The section appended to the writer brief when a whole chapter is regenerated. */
export function chapterInstructionSection(instruction: string): string {
  return [
    "## Regenerate the chapter",
    "",
    `Rewrite the whole chapter (every subchapter, the slide deck and the test), following the admin's instruction: ${instructionText(instruction)}`,
  ].join("\n");
}
