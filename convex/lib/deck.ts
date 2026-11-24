import { z } from "zod";
import type { Slide as StoredSlide } from "./engineTypes";

/**
 * The slide deck schema: the one definition of the deck JSON that the generator must produce, the
 * engine stores and the viewer renders. The model never writes HTML or slide markup; it fills this
 * shape and fixed components render it (src/components/chapter/).
 *
 * Three levels of strictness, on purpose:
 * - `deckDraftSchema` / `deckSchema`: shape, per-slide and per-deck rules. Enforced on what the
 *   model returns and again by the engine on every generated save (`engine.saveDeck`).
 * - `generatedDeckProblems`: rules only a fresh generation must meet (the share of slides with a
 *   visual). Not enforced on stored decks: a diagram that falls back to bullets, or an admin's
 *   hand edit, may lower the share.
 * - Stored decks (`slideValidator` in engineTypes.ts) are wider: older decks have no slide ids and
 *   hand edits follow `validateSlide`. `withSlideIds` turns stored slides into render-ready ones.
 *
 * Pure and dependency-free apart from zod, so Convex, the agent and the browser all import it.
 */

export const SLIDE_LAYOUTS = [
  "title",
  "bullets",
  "bullets+visual",
  "visual-full",
  "two-column",
  "code",
  "quote",
  "summary",
] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const VISUAL_TYPES = ["mermaid", "chart", "table", "image_prompt"] as const;
export const CHART_TYPES = ["bar", "line", "pie"] as const;

export const DECK_RULES = {
  minSlides: 8,
  maxSlides: 15,
  /** Share of slides that must carry a visual in a freshly generated deck. */
  minVisualShare: 0.4,
  maxBullets: 5,
  /** What the writer is asked for ("under ~12 words"). */
  bulletWords: 12,
  /** The hard limit: a little slack over the target so a 13-word bullet doesn't cost a retry. */
  bulletWordsMax: 16,
  titleChars: 120,
  bulletChars: 300,
  captionChars: 200,
  quoteChars: 500,
  notesChars: 4_000,
  mermaidChars: 3_000,
  minChartPoints: 2,
  maxChartPoints: 12,
  chartLabelChars: 40,
  maxTableColumns: 6,
  maxTableRows: 8,
  tableCellChars: 120,
  codeChars: 1_200,
  codeLines: 18,
  imagePromptChars: 600,
} as const;

const R = DECK_RULES;

/** Layouts that show `visual`; a visual on any other layout would never be seen. */
export const VISUAL_LAYOUTS: readonly SlideLayout[] = ["bullets+visual", "visual-full"];

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const line = (max: number) => z.string().trim().min(1).max(max);

const bullet = line(R.bulletChars).refine((s) => wordCount(s) <= R.bulletWordsMax, {
  error: `a bullet has at most ${R.bulletWordsMax} words (aim for under ${R.bulletWords})`,
});
const bulletList = z.array(bullet).min(1).max(R.maxBullets);

export const mermaidVisualSchema = z.object({
  type: z.literal("mermaid"),
  code: z
    .string()
    .trim()
    .min(1)
    .max(R.mermaidChars)
    .describe("Mermaid diagram source (flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, mindmap, timeline, gantt, journey). No init directives, no click handlers."),
  caption: line(R.captionChars).optional(),
});

export const chartVisualSchema = z.object({
  type: z.literal("chart"),
  chartType: z.enum(CHART_TYPES),
  data: z
    .array(z.object({ label: line(R.chartLabelChars), value: z.number() }))
    .min(R.minChartPoints)
    .max(R.maxChartPoints),
  caption: line(R.captionChars).optional(),
});

export const tableVisualSchema = z.object({
  type: z.literal("table"),
  headers: z.array(line(R.tableCellChars)).min(2).max(R.maxTableColumns),
  rows: z.array(z.array(z.string().trim().max(R.tableCellChars))).min(1).max(R.maxTableRows),
});

/** A placeholder for now: the viewer shows the alt text in a frame; nothing generates the image yet. */
export const imagePromptVisualSchema = z.object({
  type: z.literal("image_prompt"),
  prompt: line(R.imagePromptChars).describe("What the illustration should show, for a future image generator."),
  alt: line(R.captionChars).describe("Alt text shown to learners in place of the image."),
});

export const visualSchema = z.discriminatedUnion("type", [
  mermaidVisualSchema,
  chartVisualSchema,
  tableVisualSchema,
  imagePromptVisualSchema,
]);

export const codeSchema = z.object({
  language: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z0-9+#._-]+$/, { error: "language is a short identifier such as bash, ts or python" }),
  content: z
    .string()
    .min(1)
    .max(R.codeChars)
    .refine((s) => s.trim().length > 0, { error: "code must not be blank" })
    .refine((s) => s.replace(/\n+$/, "").split("\n").length <= R.codeLines, {
      error: `code on a slide has at most ${R.codeLines} lines`,
    }),
});

const slideShape = {
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, { error: "id is a short lowercase slug such as s1 or dns-lookup" })
    .describe("Unique within the deck, lowercase slug (s1, s2, …)."),
  title: line(R.titleChars),
  layout: z
    .enum(SLIDE_LAYOUTS)
    .describe(
      "title: opening (bullets[0] is an optional subtitle). bullets / summary: bullets. bullets+visual: bullets and visual. visual-full: visual only. two-column: left and right. code: code (bullets optional). quote: quote (attribution optional).",
    ),
  bullets: bulletList.optional().describe(`At most ${R.maxBullets} bullets, each under about ${R.bulletWords} words.`),
  left: bulletList.optional(),
  right: bulletList.optional(),
  quote: line(R.quoteChars).optional(),
  attribution: line(R.captionChars).optional(),
  visual: visualSchema.optional(),
  code: codeSchema.optional(),
  notes: line(R.notesChars).describe("Speaker notes: 2-4 sentences of narration, not a copy of the slide."),
};

type SlideShape = z.infer<z.ZodObject<typeof slideShape>>;

/** Problems with one visual that the shape alone can't express. */
export function visualProblems(visual: SlideShape["visual"]): string[] {
  if (!visual) return [];
  const out: string[] = [];
  if (visual.type === "table") {
    const bad = visual.rows.findIndex((row) => row.length !== visual.headers.length);
    if (bad >= 0) out.push(`table row ${bad + 1} has ${visual.rows[bad].length} cells for ${visual.headers.length} headers`);
  }
  if (visual.type === "chart") {
    if (visual.data.some((d) => !Number.isFinite(d.value))) out.push("chart values must be finite numbers");
    if (visual.chartType === "pie") {
      if (visual.data.some((d) => d.value < 0)) out.push("a pie chart cannot have negative values");
      else if (visual.data.reduce((sum, d) => sum + d.value, 0) <= 0) out.push("a pie chart needs a positive total");
    }
  }
  if (visual.type === "mermaid") {
    const problem = mermaidStaticProblem(visual.code);
    if (problem) out.push(problem);
  }
  return out;
}

/**
 * Checks that need no parser: the diagram has a body and brings no init directive (the viewer sets
 * the theme) or click handler (links and scripts never run in a deck). Syntax is checked with the
 * real parser in the agent (agents/course-builder/agent/lib/mermaid-validate.ts).
 */
export function mermaidStaticProblem(code: string): string | null {
  const lines = code.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("%%"));
  if (/%%\{/.test(code)) return "mermaid: remove the %%{init}%% directive; the viewer sets the theme";
  if (/^\s*(click|href)\s/im.test(code)) return "mermaid: click and href are not allowed";
  if (/^---\s*$/m.test(code)) return "mermaid: remove the front matter block (--- … ---)";
  if (lines.length < 2) return "mermaid: the diagram has no content after its type line";
  return null;
}

/** What each layout needs and which optional fields it shows; anything else on the slide is refused. */
const LAYOUT_FIELDS: Record<SlideLayout, { needs: (keyof SlideShape)[]; allows: (keyof SlideShape)[] }> = {
  title: { needs: [], allows: ["bullets"] },
  bullets: { needs: ["bullets"], allows: [] },
  "bullets+visual": { needs: ["bullets", "visual"], allows: [] },
  "visual-full": { needs: ["visual"], allows: [] },
  "two-column": { needs: ["left", "right"], allows: [] },
  code: { needs: ["code"], allows: ["bullets"] },
  quote: { needs: ["quote"], allows: ["attribution"] },
  summary: { needs: ["bullets"], allows: [] },
};
const CONTENT_FIELDS = ["bullets", "left", "right", "quote", "attribution", "visual", "code"] as const;

/** Per-slide rules beyond the shape: the layout's required fields, no hidden fields, visual checks. */
export function slideProblems(slide: SlideShape): string[] {
  const { needs, allows } = LAYOUT_FIELDS[slide.layout];
  const out: string[] = [];
  for (const field of needs) {
    if (slide[field] === undefined) out.push(`a ${slide.layout} slide needs ${field}`);
  }
  for (const field of CONTENT_FIELDS) {
    if (slide[field] !== undefined && !needs.includes(field) && !allows.includes(field)) {
      const hint =
        field === "visual" ? " (use bullets+visual or visual-full)" : field === "code" ? " (use the code layout)" : "";
      out.push(`a ${slide.layout} slide does not show ${field}${hint}`);
    }
  }
  if (slide.layout === "title" && (slide.bullets?.length ?? 0) > 1) {
    out.push("a title slide takes at most one bullet (the subtitle)");
  }
  out.push(...visualProblems(slide.visual));
  return out;
}

export const slideSchema = z.object(slideShape).superRefine((slide, ctx) => {
  for (const message of slideProblems(slide)) ctx.addIssue({ code: "custom", message });
});

const deckShape = {
  title: line(R.titleChars).describe("The deck's title, usually the chapter title."),
  slides: z.array(slideSchema).min(R.minSlides).max(R.maxSlides),
};

type DeckLevelProblem = { index: number; field: "layout" | "id"; message: string };

/** Rules across slides: title first, summary last, unique ids. Works on unvalidated slides too. */
function deckLevelProblems(slides: readonly { id?: unknown; layout?: unknown }[]): DeckLevelProblem[] {
  const out: DeckLevelProblem[] = [];
  if (slides.length === 0) return out;
  if (slides[0].layout !== "title") {
    out.push({ index: 0, field: "layout", message: 'the first slide must use the "title" layout' });
  }
  const last = slides.length - 1;
  if (slides[last].layout !== "summary") {
    out.push({ index: last, field: "layout", message: 'the last slide must use the "summary" layout' });
  }
  const seen = new Set<string>();
  slides.forEach((slide, index) => {
    if (typeof slide.id !== "string") return;
    if (seen.has(slide.id)) out.push({ index, field: "id", message: `slide id "${slide.id}" is used twice` });
    seen.add(slide.id);
  });
  return out;
}

function checkDeck(deck: { slides: SlideShape[] }, ctx: z.RefinementCtx) {
  for (const p of deckLevelProblems(deck.slides)) {
    ctx.addIssue({ code: "custom", path: ["slides", p.index, p.field], message: p.message });
  }
}

/** What the model writes: the deck without `chapterId`, which the pipeline stamps itself. */
export const deckDraftSchema = z.object(deckShape).superRefine(checkDeck);
/** The full deck: `{ chapterId, title, slides }`. */
export const deckSchema = z.object({ chapterId: z.string().min(1), ...deckShape }).superRefine(checkDeck);

export type Visual = z.infer<typeof visualSchema>;
export type SlideCode = z.infer<typeof codeSchema>;
export type DeckSlide = z.infer<typeof slideSchema>;
export type DeckDraft = z.infer<typeof deckDraftSchema>;
export type Deck = z.infer<typeof deckSchema>;

export function hasVisual(slide: { visual?: unknown }): boolean {
  return slide.visual !== undefined;
}

/** How many slides of an `n`-slide deck must carry a visual when it is first generated. */
export function requiredVisuals(n: number): number {
  return Math.ceil(n * R.minVisualShare - 1e-9);
}

/** Rules for a fresh generation only (see the file comment): the share of slides with a visual. */
export function generatedDeckProblems(deck: { slides: { visual?: unknown }[] }): string[] {
  const have = deck.slides.filter(hasVisual).length;
  const need = requiredVisuals(deck.slides.length);
  if (have >= need) return [];
  return [
    `only ${have} of ${deck.slides.length} slides have a visual; at least ${need} must (${Math.round(R.minVisualShare * 100)}%). Turn text slides into bullets+visual or visual-full slides with a diagram, chart or table`,
  ];
}

const MAX_ISSUES = 12;

/** Zod issues as short lines the model (or an admin) can act on: "slide 4 (s4) bullets 2: …". */
export function formatIssues(error: z.ZodError, input?: unknown): string[] {
  const slides = (input as { slides?: { id?: unknown }[] } | undefined)?.slides;
  const lines = error.issues.map((issue) => {
    const path = [...issue.path];
    let where = "";
    if (path[0] === "slides" && typeof path[1] === "number") {
      const id = Array.isArray(slides) ? slides[path[1]]?.id : undefined;
      where = `slide ${path[1] + 1}${typeof id === "string" ? ` (${id})` : ""}`;
      path.splice(0, 2);
    }
    const rest = path.map((p) => (typeof p === "number" ? String(p + 1) : String(p))).join(" ");
    const prefix = [where, rest].filter(Boolean).join(" ");
    return prefix ? `${prefix}: ${issue.message}` : issue.message;
  });
  const unique = [...new Set(lines)];
  return unique.length > MAX_ISSUES
    ? [...unique.slice(0, MAX_ISSUES), `…and ${unique.length - MAX_ISSUES} more problems`]
    : unique;
}

export type DeckCheck<T> = { ok: true; deck: T } | { ok: false; errors: string[] };

/** The slides of unvalidated data, when it at least has an array of objects there. */
function looseSlides(data: unknown): { id?: unknown; layout?: unknown; visual?: unknown }[] | null {
  const slides = (data as { slides?: unknown } | null | undefined)?.slides;
  return Array.isArray(slides) && slides.every((s) => s && typeof s === "object") ? slides : null;
}

/**
 * Checks a deck draft against the schema and lists every problem at once. Zod runs the rules across
 * slides only when each slide's shape is valid, so on a shape error they are checked here on the
 * raw data too: the model gets the whole list in one round instead of one retry per layer.
 */
export function checkDeckDraft(data: unknown): DeckCheck<DeckDraft> {
  const parsed = deckDraftSchema.safeParse(data);
  if (parsed.success) return { ok: true, deck: parsed.data };
  const errors = formatIssues(parsed.error, data);
  const slides = looseSlides(data);
  const acrossSlides = (slides ? deckLevelProblems(slides) : []).map((p) => {
    const id = slides?.[p.index]?.id;
    return `slide ${p.index + 1}${typeof id === "string" ? ` (${id})` : ""} ${p.field}: ${p.message}`;
  });
  return { ok: false, errors: [...new Set([...acrossSlides, ...errors])] };
}

/** Validates what the model returned for a whole deck: shape and deck rules, and the visual share. */
export function validateGeneratedDeck(data: unknown): DeckCheck<DeckDraft> {
  const check = checkDeckDraft(data);
  const slides = check.ok ? check.deck.slides : looseSlides(data);
  const share = slides ? generatedDeckProblems({ slides }) : [];
  if (!check.ok) return { ok: false, errors: [...check.errors, ...share] };
  return share.length > 0 ? { ok: false, errors: share } : check;
}

/** Validates one slide (a single-slide repair). */
export function validateSlideData(data: unknown): { ok: true; slide: DeckSlide } | { ok: false; errors: string[] } {
  const parsed = slideSchema.safeParse(data);
  return parsed.success ? { ok: true, slide: parsed.data } : { ok: false, errors: formatIssues(parsed.error) };
}

function clampWords(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.length <= R.bulletWordsMax ? text.trim() : `${words.slice(0, R.bulletWordsMax - 1).join(" ")}…`;
}

/**
 * The fallback for a slide whose diagram could not be made valid: the same slide on the `bullets`
 * layout, without the visual. Keeps the slide's own bullets; a slide that had none (visual-full)
 * gets its caption and the sentences of its speaker notes, clamped to bullet length.
 */
export function toBulletsFallback(slide: DeckSlide): DeckSlide {
  let bullets = slide.bullets ?? [];
  if (bullets.length === 0) {
    const caption = slide.visual && "caption" in slide.visual && slide.visual.caption ? [slide.visual.caption] : [];
    const sentences = slide.notes
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    bullets = [...caption, ...sentences].slice(0, R.maxBullets).map(clampWords);
  }
  return { id: slide.id, title: slide.title, layout: "bullets", bullets, notes: slide.notes };
}

/**
 * Stored slides as render-ready slides: every slide gets a unique id (decks saved before ids
 * existed, or hand-edited ones, may lack them). Nothing else is changed or checked, so an older
 * deck renders as it was saved.
 */
export function withSlideIds<T extends { id?: string }>(slides: T[]): (T & { id: string })[] {
  const seen = new Set<string>();
  return slides.map((slide, i) => {
    let id = slide.id?.trim() || `slide-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { ...slide, id };
  });
}

/**
 * Every plain-text string of a deck that learners read, for the engine's "no invented links" scan.
 * Diagram source is included (a diagram must not smuggle a URL); `code.content` is not, like a code
 * block in a lesson body.
 */
export function deckTexts(slides: StoredSlide[], title?: string): string[] {
  const out: string[] = title ? [title] : [];
  for (const s of slides) {
    out.push(s.title, ...(s.bullets ?? []), ...(s.left ?? []), ...(s.right ?? []), s.quote ?? "", s.attribution ?? "", s.notes);
    const visual = s.visual;
    if (!visual) continue;
    if (visual.type === "mermaid") out.push(visual.code, visual.caption ?? "");
    else if (visual.type === "chart") out.push(visual.caption ?? "", ...visual.data.map((d) => d.label));
    else if (visual.type === "table") out.push(...visual.headers, ...visual.rows.flat());
    else out.push(visual.prompt, visual.alt);
  }
  return out.filter((text) => text.trim() !== "");
}
