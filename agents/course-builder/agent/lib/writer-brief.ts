import { z } from "zod";
import type { JobBrief, Language } from "../../../../convex/lib/engineTypes";
import { youtubeIdFromUrl } from "../../../../src/components/markdown/embeds";

/**
 * What one chapter-writer run returns (the subagent's `outputSchema`; the write fan-out reads it).
 * Defined once here so the workflow tool and the tests share it.
 */
export const writerOutputSchema = z.object({
  chapterOrder: z.number().int().min(1).describe("The chapter you wrote."),
  saved: z.object({
    subchapters: z.number().int().min(0).describe("How many subchapters were saved successfully."),
    test: z.boolean().describe("True when the chapter test was saved."),
  }),
  problems: z
    .array(z.string())
    .describe("One short line per save that still failed after 2 retries, with the engine's message. Empty when all saved."),
});
export type WriterOutput = z.infer<typeof writerOutputSchema>;

const LANGUAGES: Record<Language, { name: string; trueFalse: [string, string] }> = {
  en: { name: "English", trueFalse: ["True", "False"] },
  he: { name: "Hebrew", trueFalse: ["נכון", "לא נכון"] },
  ru: { name: "Russian", trueFalse: ["Верно", "Неверно"] },
};

/**
 * Per-item text caps that keep the brief bounded: a pasted-text preview (the full text stays on the
 * platform) and a source excerpt (the engine stores up to 5 000 characters; writers see the first
 * 1 500, which is all they may quote or rely on).
 */
const TEXT_PREVIEW = 1_500;
const EXCERPT_PREVIEW = 1_500;

type Resource = JobBrief["resources"][number];

/**
 * The message that starts one chapter-writer run: the course brief, the chapter's plan, the job's
 * saved sources (with excerpts), the admin's pasted text (source material only), the admin
 * resources planned for this chapter (with ready-to-paste embed blocks) and the save rules. Pure
 * and deterministic.
 *
 * Titles and goals come from the course rows (`summary` holds the outline goal from approval and
 * follows the admin's renames and reorders). Planned `resourceIds` exist only in the frozen outline:
 * the outline chapter is matched by title, else by order (chapters are never reordered); within it a
 * resource goes to the subchapter with exactly the same title, and resources of outline subchapters
 * that match no lesson are offered at chapter level, tagged with the outline title, for the writer
 * to place. Never by position, so a resource can't land on a neighbouring lesson.
 * Only readable resources are offered: PDFs and web pages as ```resource blocks (never a storage
 * URL), YouTube as a ```youtube block. Pasted text is never a block (learners never see it): every
 * readable text resource of the job is listed under "Pasted material" for the writer to draw on.
 */
export function buildWriterBrief(job: JobBrief, chapterOrder: number): string {
  const chapter = job.course?.chapters.find((c) => c.order === chapterOrder);
  if (!chapter) throw new Error(`The course has no chapter ${chapterOrder}`);
  const lang = LANGUAGES[job.language];
  const trueFalse = JSON.stringify(lang.trueFalse);

  const outlineChapters = job.outline?.chapters ?? [];
  const planned =
    outlineChapters.find((c) => sameTitle(c.title, chapter.title)) ?? outlineChapters[chapterOrder - 1];
  const resourcesById = new Map(job.resources.map((r) => [r.id, r]));
  const embeds = (planned?.subchapters ?? []).flatMap((p) => {
    const lesson = chapter.subchapters.find((s) => sameTitle(s.title, p.title));
    const at = lesson
      ? { order: lesson.order, label: `Subchapter ${chapterOrder}.${lesson.order}` }
      : { order: Infinity, label: `Chapter ${chapterOrder}, planned for "${oneLine(p.title)}"` };
    return (p.resourceIds ?? []).flatMap((id) => {
      const r = resourcesById.get(id);
      const block = r ? embedBlock(r) : null;
      return r && block ? [{ ...at, r, block }] : [];
    });
  });
  // Subchapter placements in lesson order first, then the chapter-level ones (stable sort).
  embeds.sort((a, b) => a.order - b.order);

  const sources = job.sources.map((s) => {
    const parts = [`[${s.id}] ${oneLine(s.title)}`, s.url];
    if (s.excerpt?.trim()) parts.push(preview(s.excerpt, EXCERPT_PREVIEW));
    let line = `- ${parts.join(" — ")}`;
    const videoId = s.kind === "youtube" ? youtubeIdFromUrl(s.url) : null;
    if (videoId) line += `\n  Embeddable video, block:\n${fence("youtube", { videoId, title: s.title })}`;
    return line;
  });

  const pasted = job.resources.filter((r) => r.kind === "text" && r.readStatus !== "unreadable" && r.text?.trim());

  const out: string[] = [];
  out.push(
    `# Write chapter ${chapterOrder}: ${chapter.title}`,
    "",
    `Write chapter ${chapterOrder} of the course below: its subchapters and its test, through your save tools. Use jobId ${job.jobId} and chapterOrder ${chapterOrder} in every call.`,
    "",
    "## Course",
    "",
    `- jobId: ${job.jobId}`,
    `- Topic: ${job.topic}`,
    `- Language: ${lang.name} (${job.language}). Write everything learners see in ${lang.name}: titles, summaries, lessons, quizzes and test questions. Sources may be in any language; translate what you use and keep proper nouns, product names, code and identifiers as they are.`,
    `- Level: ${job.level}`,
    `- Audience: ${job.audience?.trim() || "not specified (general learners at this level)"}`,
  );
  if (job.notes?.trim()) out.push(`- Admin notes: ${job.notes.trim()}`);
  out.push(
    "- Chapters of the course:",
    ...(job.course?.chapters ?? []).map(
      (c) => `  ${c.order}. ${c.title}${c.order === chapterOrder ? " (this chapter)" : ""}`,
    ),
    "",
    `## Chapter ${chapterOrder}: ${chapter.title}`,
    "",
    `Goal: ${chapter.summary}`,
    "",
    `Subchapters (save each with chapterOrder ${chapterOrder} and its subchapterOrder, in the course language):`,
    "",
    ...chapter.subchapters.map(
      (s) =>
        `- ${chapterOrder}.${s.order} ${s.title} (subchapterOrder ${s.order})${s.summary.trim() ? ` — goal: ${oneLine(s.summary)}` : ""}`,
    ),
    "",
    "## Sources",
    "",
  );
  if (sources.length > 0) {
    out.push(
      "These are the only sources you may cite or link. Pass the ids you cite in that subchapter's `sourceIds`; in the body, `[n]` is the n-th id in that `sourceIds` list (`[1]` is the first). Link only to these URLs. The excerpt is all you know of a source: cite `[n]` only for claims its excerpt (or, without one, its title) clearly supports, and never attribute a specific figure or quote to a source whose excerpt doesn't contain it.",
      "",
      ...sources,
    );
  } else {
    out.push("No saved sources: cite nothing (no `[n]`), pass `sourceIds: []` and put no http(s) links anywhere.");
  }
  if (pasted.length > 0) {
    out.push(
      "",
      "## Pasted material",
      "",
      "Text the admin pasted for this course. It is source material only: draw on its content where it fits this chapter, in your own words. Never place it with a ```resource block, never cite it as `[n]` and never link it.",
      "",
      ...pasted.map((r) => `- "${oneLine(r.title)}": ${preview(r.text ?? "", TEXT_PREVIEW)}`),
    );
  }
  out.push("", "## Resources you may embed", "");
  if (embeds.length > 0) {
    out.push(
      "Admin resources planned for this chapter. Embed one only in its subchapter (one marked \"Chapter N, planned for ...\" was planned for a lesson that has since been renamed or removed: put it in the subchapter where it fits best, or leave it out) and only when it clearly helps, by pasting its block exactly as shown (one fenced block on its own lines). These are not `[n]` sources.",
      "",
      ...embeds.map(
        ({ label, r, block }) => `- ${label}, ${KIND_LABEL[r.kind]} "${oneLine(r.title)}"\n  Block:\n${block}`,
      ),
    );
  } else {
    out.push("No admin resources are planned for this chapter. Do not add ```resource blocks.");
  }
  out.push(
    "",
    "## Rules",
    "",
    "- Each subchapter: a markdown body with 1-3 ```quiz blocks, a one-line summary and durationMinutes (whole minutes of study).",
    "- The chapter's slide deck is built from your saved lessons afterwards, by a separate step: do not write slides.",
    `- Test: 8-10 questions answerable from this chapter's subchapters, mixing single, multiple and true_false. True/False options are exactly ${trueFalse}.`,
    "- No raw URLs in titles, summaries or test questions: those are plain text and any unknown http(s) URL is rejected.",
    '- On a save error ("CODE: detail" or "Unknown reference: X"), fix what it names and save again, at most 2 retries per save; then list it in `problems`.',
  );
  return out.join("\n");
}

const KIND_LABEL: Record<Resource["kind"], string> = {
  pdf: "PDF",
  text: "Text",
  url: "Web page",
  youtube: "YouTube video",
};

/**
 * The embed block for a planned resource, or null when it can't be shown (unreadable, no video ID)
 * or must not be: pasted text is source material only and never a learner-facing block.
 */
function embedBlock(r: Resource): string | null {
  if (r.readStatus === "unreadable" || r.kind === "text") return null;
  if (r.kind === "youtube") {
    const videoId = r.url ? youtubeIdFromUrl(r.url) : null;
    return videoId ? fence("youtube", { videoId, title: r.title }) : null;
  }
  return fence("resource", { resourceId: r.id });
}

/** A fenced embed block, exactly as it must appear in the lesson body (the format of embeds.ts). */
function fence(lang: "youtube" | "resource", body: object): string {
  return `\`\`\`${lang}\n${JSON.stringify(body)}\n\`\`\``;
}

function sameTitle(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function preview(text: string, max: number): string {
  const flat = oneLine(text);
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
