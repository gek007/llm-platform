import { v, type Infer } from "convex/values";
import type { levelValidator } from "../schema";

export const languageValidator = v.union(v.literal("en"), v.literal("he"), v.literal("ru"));
export const lengthValidator = v.union(v.literal("short"), v.literal("medium"), v.literal("long"));

export const slideValidator = v.object({
  layout: v.union(
    v.literal("title"),
    v.literal("bullets"),
    v.literal("two-column"),
    v.literal("quote"),
    v.literal("summary"),
  ),
  title: v.string(),
  bullets: v.optional(v.array(v.string())),
  left: v.optional(v.array(v.string())),
  right: v.optional(v.array(v.string())),
  quote: v.optional(v.string()),
  attribution: v.optional(v.string()),
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
