import { v, type Infer } from "convex/values";
import type { levelValidator } from "../schema";

export const languageValidator = v.union(v.literal("en"), v.literal("he"), v.literal("ru"));
export const lengthValidator = v.union(v.literal("short"), v.literal("medium"), v.literal("long"));

export const visualValidator = v.union(
  v.object({ type: v.literal("mermaid"), code: v.string(), caption: v.optional(v.string()) }),
  v.object({
    type: v.literal("chart"),
    chartType: v.union(v.literal("bar"), v.literal("line"), v.literal("pie")),
    data: v.array(v.object({ label: v.string(), value: v.number() })),
    caption: v.optional(v.string()),
  }),
  v.object({ type: v.literal("table"), headers: v.array(v.string()), rows: v.array(v.array(v.string())) }),
  v.object({ type: v.literal("image_prompt"), prompt: v.string(), alt: v.string() }),
);

/**
 * A stored slide. The storage shape of the deck schema in ./deck.ts (Zod), which holds the rules;
 * this validator is wider so decks saved before `id`, `visual` and `code` existed still load:
 * `id` is optional here and filled in at read time (`withSlideIds`). Every addition is optional,
 * so no data migration is needed.
 */
export const slideValidator = v.object({
  id: v.optional(v.string()),
  layout: v.union(
    v.literal("title"),
    v.literal("bullets"),
    v.literal("bullets+visual"),
    v.literal("visual-full"),
    v.literal("two-column"),
    v.literal("code"),
    v.literal("quote"),
    v.literal("summary"),
  ),
  title: v.string(),
  bullets: v.optional(v.array(v.string())),
  left: v.optional(v.array(v.string())),
  right: v.optional(v.array(v.string())),
  quote: v.optional(v.string()),
  attribution: v.optional(v.string()),
  visual: v.optional(visualValidator),
  code: v.optional(v.object({ language: v.string(), content: v.string() })),
  notes: v.string(),
});

export const questionValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("single"), v.literal("multiple"), v.literal("true_false")),
  prompt: v.string(),
  options: v.array(v.string()),
  correct: v.array(v.number()),
  explanation: v.string(),
});

export const outlineValidator = v.object({
  chapters: v.array(
    v.object({
      title: v.string(),
      goal: v.string(),
      subchapters: v.array(
        v.object({
          title: v.string(),
          goal: v.string(),
          resourceIds: v.optional(v.array(v.string())),
        }),
      ),
    }),
  ),
});

export const jobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("researching"),
  v.literal("outline_ready"),
  v.literal("writing"),
  v.literal("ready"),
  v.literal("failed"),
);
export const resourceKindValidator = v.union(
  v.literal("url"),
  v.literal("pdf"),
  v.literal("youtube"),
  v.literal("text"),
);
export const readStatusValidator = v.union(
  v.literal("pending"),
  v.literal("read"),
  v.literal("embed_only"),
  v.literal("unreadable"),
);
export const sourceKindValidator = v.union(
  v.literal("web"),
  v.literal("pdf"),
  v.literal("youtube"),
  v.literal("text"),
);
export const eventKindValidator = v.union(
  v.literal("info"),
  v.literal("source"),
  v.literal("outline"),
  v.literal("chapter"),
  v.literal("error"),
);

/**
 * The command the dispatcher sends to the course-builder agent, as stored on the job
 * (`generationJobs.pendingCommand`). Mirrors `EngineCommand` in src/lib/course-builder/commands.ts.
 */
export const regenerateTargetValidator = v.object({
  kind: v.union(v.literal("subchapter"), v.literal("deck"), v.literal("test"), v.literal("chapter")),
  chapterOrder: v.number(),
  subchapterOrder: v.optional(v.number()),
});
export const engineCommandValidator = v.union(
  v.object({ action: v.literal("research"), jobId: v.string() }),
  v.object({ action: v.literal("write"), jobId: v.string() }),
  v.object({
    action: v.literal("regenerate"),
    jobId: v.string(),
    target: regenerateTargetValidator,
    instruction: v.string(),
  }),
);

export type Language = Infer<typeof languageValidator>;
export type Length = Infer<typeof lengthValidator>;
export type Slide = Infer<typeof slideValidator>;
export type Question = Infer<typeof questionValidator>;
export type PublicQuestion = Omit<Question, "correct" | "explanation">;
export type Outline = Infer<typeof outlineValidator>;
export type JobStatus = Infer<typeof jobStatusValidator>;
export type Level = Infer<typeof levelValidator>;
export type ResourceKind = Infer<typeof resourceKindValidator>;
export type ReadStatus = Infer<typeof readStatusValidator>;
export type SourceKind = Infer<typeof sourceKindValidator>;
export type EventKind = Infer<typeof eventKindValidator>;
export type StoredEngineCommand = Infer<typeof engineCommandValidator>;

/**
 * What `engine.getJob` returns (and `/engine/getJob` sends, minus `ok`): everything the
 * course-builder agent needs for any command. IDs are plain strings on the wire.
 */
export type JobBrief = {
  jobId: string;
  status: JobStatus;
  topic: string;
  language: Language;
  level: Level;
  length: Length;
  audience?: string;
  notes?: string;
  resources: {
    id: string;
    kind: ResourceKind;
    title: string;
    url?: string;
    /** Convex storage URL for an uploaded PDF. */
    fileUrl?: string;
    text?: string;
    readStatus: ReadStatus;
  }[];
  /** `excerpt`: the key facts the research phase saved with the source (the writers' only view of it). */
  sources: { id: string; url: string; title: string; kind: SourceKind; excerpt?: string }[];
  /** The approved (or proposed) outline; frozen history once the course exists. */
  outline?: Outline;
  /** The draft course skeleton and what is already written, once the outline is approved. */
  course?: {
    courseId: string;
    chapters: {
      order: number;
      title: string;
      summary: string;
      /** `summary`: the lesson row's summary (the outline goal at approval, then what was written). */
      subchapters: { order: number; title: string; summary: string; hasBody: boolean }[];
      hasDeck: boolean;
      hasTest: boolean;
    }[];
  };
};

/**
 * What `engine.getChapterContent` returns: one chapter's saved content, so a regenerate can ground
 * a rewritten item in what learners already read. Bodies are capped at `CHAPTER_BODY_CAP` characters
 * (`truncated` says so); deck and test only as context (slide titles, question prompts; no answers).
 */
export type ChapterContent = {
  chapterOrder: number;
  title: string;
  lessons: { order: number; title: string; body: string; truncated: boolean }[];
  deckSlideTitles: string[];
  testPrompts: string[];
};
export const CHAPTER_BODY_CAP = 12_000;

export const LENGTH_PRESETS: Record<Length, { chapters: number; minSub: number; maxSub: number }> = {
  short: { chapters: 3, minSub: 2, maxSub: 3 },
  medium: { chapters: 5, minSub: 3, maxSub: 3 },
  long: { chapters: 8, minSub: 3, maxSub: 4 },
};
export const MAX_CHAPTERS = 10;
export const MAX_SUBCHAPTERS = 5;
export const TEST_DEFAULTS = { passPercent: 70, maxAttempts: 3 };
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const RTL_LANGUAGES = ["he"];
