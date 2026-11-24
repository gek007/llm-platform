import { DECK_RULES } from "../../../../convex/lib/deck";
import type { ChapterContent, JobBrief } from "./engine-client";

/**
 * The message that starts one deck-writer run (subagents/deck-writer): the course, its whole
 * outline, the style guide every chapter's deck shares, this chapter's saved lessons (the material
 * the deck presents) and the rules. Pure and deterministic.
 *
 * The outline and the style guide are what keep decks coherent across chapters: each deck is
 * written in its own model call, in parallel, and sees no other deck.
 */

const LANGUAGE_NAMES: Record<JobBrief["language"], string> = { en: "English", he: "Hebrew", ru: "Russian" };
const EXCERPT_PREVIEW = 600;
const R = DECK_RULES;

/**
 * The style guide: one voice and one visual vocabulary for every deck of a course. Part of the
 * brief (not only the system prompt) so it travels with the course's level and audience.
 */
export function deckStyleGuide(job: Pick<JobBrief, "level" | "audience" | "language">): string {
  const audience = job.audience?.trim() || "general learners";
  return [
    `- Voice: a teacher talking to ${audience} at ${job.level} level. Plain words, active verbs, present tense. Define a term the first time it appears on a slide.`,
    "- One idea per slide. The slide shows the idea; the speaker notes explain it.",
    "- Titles: a short statement or question (under 8 words), sentence case, no trailing punctuation, no numbering.",
    `- Bullets: at most ${R.maxBullets} per slide, each under ${R.bulletWords} words, parallel in grammar, no nested lists, no full stops. Never a paragraph.`,
    "- Show, don't tell: a process is a flowchart or sequence diagram, a structure a class or mind map, a comparison a table, real numbers a chart. Text-only slides are for definitions, takeaways and transitions.",
    "- Diagrams: Mermaid, small (at most 10 nodes), labels of 1-4 words, the same shape for the same kind of thing across slides, left-to-right for sequences and top-down for hierarchies. No colours, styles or themes: the viewer themes them.",
    "- Charts: only numbers that the lessons or sources state. Never invent data to fill a chart; without real numbers, use a diagram or a table.",
    "- Tables: at most 6 columns and 8 rows, short cells, a header row.",
    "- Code: a short, runnable sample on a `code` slide, never inside a bullet.",
    "- Terms and names: use the lessons' terms exactly, every time. Do not rename a concept between slides or chapters.",
    "- Opening slide: the chapter title and a one-line subtitle. Closing slide: 3-5 takeaways a learner could repeat.",
  ].join("\n");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @param content the chapter's saved lessons (engine `getChapterContent`): what the deck presents
 * @param instruction an admin's regenerate instruction, when this deck replaces a saved one
 */
export function buildDeckBrief(job: JobBrief, content: ChapterContent, instruction?: string): string {
  const chapterOrder = content.chapterOrder;
  const chapter = job.course?.chapters.find((c) => c.order === chapterOrder);
  if (!chapter) throw new Error(`The course has no chapter ${chapterOrder}`);
  const language = LANGUAGE_NAMES[job.language];
  const quotable = job.sources.filter((s) => s.excerpt?.trim());

  const out: string[] = [
    `# Slide deck for chapter ${chapterOrder}: ${chapter.title}`,
    "",
    `Write the slide deck for chapter ${chapterOrder} of the course below, as one JSON object in the required shape.`,
    "",
    "## Course",
    "",
    `- Topic: ${job.topic}`,
    `- Language: ${language} (${job.language}). Everything learners read is in ${language}: titles, bullets, captions, table cells, chart labels, diagram labels and speaker notes. Keep proper nouns, product names, code and identifiers as they are.`,
    `- Level: ${job.level}`,
    `- Audience: ${job.audience?.trim() || "not specified (general learners at this level)"}`,
  ];
  if (job.notes?.trim()) out.push(`- Admin notes: ${job.notes.trim()}`);
  out.push(
    "",
    "## Course outline",
    "",
    "Every chapter gets its own deck, written separately. Stay inside this chapter: do not teach what another chapter covers, and do not repeat an earlier chapter beyond a one-line reminder.",
    "",
  );
  for (const c of job.course?.chapters ?? []) {
    out.push(`${c.order}. ${oneLine(c.title)}${c.order === chapterOrder ? " (this chapter)" : ""}`);
    for (const s of c.subchapters) out.push(`   ${c.order}.${s.order} ${oneLine(s.title)}`);
  }
  out.push(
    "",
    "## Style guide (the same for every chapter of this course)",
    "",
    deckStyleGuide(job),
    "",
    `## Chapter ${chapterOrder}: ${chapter.title}`,
    "",
    `Goal: ${oneLine(chapter.summary)}`,
    "",
    "These are the chapter's lessons as learners read them. Build every slide from them: present nothing they do not teach, and take numbers only from them. Ignore their ```quiz, ```resource and ```youtube blocks.",
  );
  for (const lesson of content.lessons) {
    out.push("", `### Lesson ${chapterOrder}.${lesson.order}: ${lesson.title}`, "", lesson.body.trim() || "(no body saved)");
    if (lesson.truncated) out.push("", "[Truncated: the saved lesson is longer.]");
  }
  out.push("", "## Quotable sources", "");
  if (quotable.length > 0) {
    out.push(
      "A `quote` slide may only carry text copied word for word from one of these excerpts, with the source's title as `attribution`. If nothing here is worth quoting, use no quote slide.",
      "",
      ...quotable.map((s) => {
        const excerpt = oneLine(s.excerpt ?? "");
        return `- "${oneLine(s.title)}": ${excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW).trimEnd()}…` : excerpt}`;
      }),
    );
  } else {
    out.push("None: use no `quote` slide.");
  }
  out.push(
    "",
    "## Rules",
    "",
    `- ${R.minSlides}-${R.maxSlides} slides. The first uses the \`title\` layout, the last the \`summary\` layout. Slide ids are s1, s2, … in order.`,
    `- At least ${Math.round(R.minVisualShare * 100)}% of the slides carry a \`visual\` (layout \`bullets+visual\` or \`visual-full\`). Diagrams are always Mermaid code, never a description of a picture.`,
    `- At most ${R.maxBullets} bullets per slide, each under ${R.bulletWords} words. No walls of text.`,
    "- Speaker notes of 2-4 sentences on every slide: what a presenter says, not a copy of the slide.",
    "- No URLs anywhere on a slide or in the notes, and no HTML or markdown: every field is plain text.",
  );
  if (instruction !== undefined) {
    out.push(
      "",
      "## Regenerate",
      "",
      `This deck replaces the chapter's saved deck. The admin asked: ${instruction.trim() || "(no instruction: write it again to a higher standard, following the rules)"}`,
    );
    if (content.deckSlideTitles.length > 0) {
      out.push("", "Slide titles of the deck you replace:", "", ...content.deckSlideTitles.map((t) => `- ${oneLine(t)}`));
    }
  }
  return out.join("\n");
}
