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
    deck: z.boolean().describe("True when the slide deck was saved."),
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

/** Pasted text shown to the writer so it can introduce the resource; the full text stays on the platform. */
const TEXT_PREVIEW = 1_500;

type Source = JobBrief["sources"][number] & { excerpt?: string };
type Resource = JobBrief["resources"][number];

/**
 * The message that starts one chapter-writer run: the course brief, the chapter's plan, the job's
 * saved sources, the admin resources planned for this chapter (with ready-to-paste embed blocks)
 * and the save rules. Pure and deterministic.
 *
 * Titles come from the course skeleton (the admin may have edited them after approval); goals and
 * planned `resourceIds` come from the outline, matched by title and falling back to position.
 * Only readable resources planned for this chapter's subchapters are offered: PDFs, pasted text and
 * web pages as ```resource blocks (never a storage URL), YouTube as a ```youtube block.
 */
export function buildWriterBrief(job: JobBrief, chapterOrder: number): string {
  const chapter = job.course?.chapters.find((c) => c.order === chapterOrder);
  if (!chapter) throw new Error(`The course has no chapter ${chapterOrder}`);
  const lang = LANGUAGES[job.language];
  const trueFalse = JSON.stringify(lang.trueFalse);

  const planned = pick(job.outline?.chapters ?? [], chapter.title, chapterOrder - 1);
  const subchapters = chapter.subchapters.map((s) => {
    const plan = pick(planned?.subchapters ?? [], s.title, s.order - 1);
    return { ...s, goal: plan?.goal, resourceIds: plan?.resourceIds ?? [] };
  });

  const resourcesById = new Map(job.resources.map((r) => [r.id, r]));
  const embeds = subchapters.flatMap((s) =>
    s.resourceIds.flatMap((id) => {
      const r = resourcesById.get(id);
      const block = r ? embedBlock(r) : null;
      return r && block ? [{ at: `${chapterOrder}.${s.order}`, r, block }] : [];
    }),
  );

  const sources = (job.sources as Source[]).map((s) => {
    const parts = [`[${s.id}] ${oneLine(s.title)}`, s.url];
    if (s.excerpt?.trim()) parts.push(oneLine(s.excerpt));
    let line = `- ${parts.join(" — ")}`;
    const videoId = s.kind === "youtube" ? youtubeIdFromUrl(s.url) : null;
    if (videoId) line += `\n  Embeddable video, block:\n${fence("youtube", { videoId, title: s.title })}`;
    return line;
  });

  const out: string[] = [];
  out.push(
    `# Write chapter ${chapterOrder}: ${chapter.title}`,
    "",
    `Write chapter ${chapterOrder} of the course below: its subchapters, its slide deck and its test, through your save tools. Use jobId ${job.jobId} and chapterOrder ${chapterOrder} in every call.`,
    "",
    "## Course",
    "",
    `- jobId: ${job.jobId}`,
    `- Topic: ${job.topic}`,
    `- Language: ${lang.name} (${job.language}). Write everything learners see in ${lang.name}: titles, summaries, lessons, quizzes, slides, speaker notes and test questions. Sources may be in any language; translate what you use and keep proper nouns, product names, code and identifiers as they are.`,
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
    ...subchapters.map(
      (s) => `- ${chapterOrder}.${s.order} ${s.title} (subchapterOrder ${s.order})${s.goal ? ` — goal: ${s.goal}` : ""}`,
    ),
    "",
    "## Sources",
    "",
  );
  if (sources.length > 0) {
    out.push(
      "These are the only sources you may cite or link. Pass the ids you cite in that subchapter's `sourceIds`; in the body, `[n]` is the n-th id in that `sourceIds` list (`[1]` is the first). Link only to these URLs.",
      "",
      ...sources,
    );
  } else {
    out.push("No saved sources: cite nothing (no `[n]`), pass `sourceIds: []` and put no http(s) links anywhere.");
  }
  out.push("", "## Resources you may embed", "");
  if (embeds.length > 0) {
    out.push(
      "Admin resources planned for this chapter. Embed one only in its subchapter and only when it clearly helps, by pasting its block exactly as shown (one fenced block on its own lines). These are not `[n]` sources.",
      "",
      ...embeds.map(({ at, r, block }) => {
        let line = `- Subchapter ${at}, ${KIND_LABEL[r.kind]} "${oneLine(r.title)}"`;
        if (r.kind === "text" && r.text?.trim()) line += `\n  Text: ${preview(r.text)}`;
        return `${line}\n  Block:\n${block}`;
      }),
    );
  } else {
    out.push("No admin resources are planned for this chapter. Do not add ```resource blocks.");
  }
  out.push(
    "",
    "## Rules",
    "",
    "- Each subchapter: a markdown body with 1-3 ```quiz blocks, a one-line summary and durationMinutes (whole minutes of study).",
    "- Slide deck: 6-12 slides, varied layouts, speaker notes of 2-4 sentences on every slide.",
    `- Test: 8-10 questions answerable from this chapter's subchapters, mixing single, multiple and true_false. True/False options are exactly ${trueFalse}.`,
    "- No raw URLs in titles, summaries, slides or test questions: those are plain text and any unknown http(s) URL is rejected.",
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

/** The embed block for a planned resource, or null when it can't be shown (unreadable, no video ID). */
function embedBlock(r: Resource): string | null {
  if (r.readStatus === "unreadable") return null;
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

/** The outline item with this title, else the one at this position. */
function pick<T extends { title: string }>(items: T[], title: string, index: number): T | undefined {
  return items.find((i) => i.title.trim() === title.trim()) ?? items[index];
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function preview(text: string): string {
  const flat = oneLine(text);
  return flat.length > TEXT_PREVIEW ? `${flat.slice(0, TEXT_PREVIEW)}…` : flat;
}
