import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  engineCommandValidator,
  eventKindValidator,
  jobStatusValidator,
  languageValidator,
  lengthValidator,
  outlineValidator,
  questionValidator,
  readStatusValidator,
  resourceKindValidator,
  slideValidator,
  sourceKindValidator,
} from "./lib/engineTypes";

export const levelValidator = v.union(
  v.literal("beginner"),
  v.literal("intermediate"),
  v.literal("advanced"),
);
export const tierValidator = v.union(v.literal("free"), v.literal("pro"));
export const courseStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);
export const videoStatusValidator = v.union(
  v.literal("waiting"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("errored"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  }).index("by_clerkId", ["clerkId"]),

  courses: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    description: v.string(),
    level: levelValidator,
    tier: tierValidator,
    status: courseStatusValidator,
    tags: v.array(v.string()),
    outcomes: v.array(v.string()),
    coverImageUrl: v.optional(v.string()),
    order: v.number(),
    language: v.optional(languageValidator),
    generationJobId: v.optional(v.id("generationJobs")),
  })
    .index("by_slug", ["slug"])
    .index("by_status_order", ["status", "order"]),

  lessons: defineTable({
    courseId: v.id("courses"),
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    order: v.number(),
    durationMinutes: v.number(),
    isFreePreview: v.boolean(),
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    videoStatus: v.optional(videoStatusValidator),
    chapterId: v.optional(v.id("chapters")),
    sourceIds: v.optional(v.array(v.id("generationSources"))),
  })
    .index("by_course_order", ["courseId", "order"])
    .index("by_course_slug", ["courseId", "slug"])
    .index("by_chapter_order", ["chapterId", "order"])
    .index("by_muxAssetId", ["muxAssetId"])
    .index("by_muxUploadId", ["muxUploadId"]),

  enrollments: defineTable({
    userId: v.string(),
    courseId: v.id("courses"),
    enrolledAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_course", ["courseId"]),

  lessonProgress: defineTable({
    userId: v.string(),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    completedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_lesson", ["userId", "lessonId"])
    .index("by_course", ["courseId"])
    .index("by_lesson", ["lessonId"]),

  chapters: defineTable({
    courseId: v.id("courses"),
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    order: v.number(),
  })
    .index("by_course_order", ["courseId", "order"])
    .index("by_course_slug", ["courseId", "slug"]),

  slideDecks: defineTable({
    courseId: v.id("courses"),
    chapterId: v.id("chapters"),
    slides: v.array(slideValidator),
    updatedAt: v.number(),
  }).index("by_chapter", ["chapterId"]),

  chapterTests: defineTable({
    courseId: v.id("courses"),
    chapterId: v.id("chapters"),
    version: v.number(),
    passPercent: v.number(),
    maxAttempts: v.number(),
    questions: v.array(questionValidator),
  })
    .index("by_chapter", ["chapterId"])
    .index("by_course", ["courseId"]),

  testAttempts: defineTable({
    userId: v.string(),
    courseId: v.id("courses"),
    testId: v.id("chapterTests"),
    testVersion: v.number(),
    answers: v.array(v.array(v.number())),
    scorePercent: v.number(),
    passed: v.boolean(),
    submittedAt: v.number(),
  })
    .index("by_user_test", ["userId", "testId"])
    .index("by_test", ["testId"])
    .index("by_user_course", ["userId", "courseId"]),

  courseResources: defineTable({
    jobId: v.id("generationJobs"),
    courseId: v.optional(v.id("courses")),
    kind: resourceKindValidator,
    title: v.string(),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
    origin: v.union(v.literal("admin"), v.literal("engine")),
    readStatus: readStatusValidator,
  })
    .index("by_job", ["jobId"])
    .index("by_course", ["courseId"]),

  generationJobs: defineTable({
    createdBy: v.string(),
    topic: v.string(),
    language: languageValidator,
    level: levelValidator,
    length: lengthValidator,
    audience: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: jobStatusValidator,
    eveSessionId: v.optional(v.string()),
    dispatchError: v.optional(v.string()),
    /** The last command the route dispatched (or tried to); Resume re-sends exactly it. */
    pendingCommand: v.optional(engineCommandValidator),
    outline: v.optional(outlineValidator),
    courseId: v.optional(v.id("courses")),
    error: v.optional(v.string()),
    usage: v.optional(
      v.object({
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  generationEvents: defineTable({
    jobId: v.id("generationJobs"),
    at: v.number(),
    kind: eventKindValidator,
    message: v.string(),
    chapterOrder: v.optional(v.number()),
  }).index("by_job_at", ["jobId", "at"]),

  generationSources: defineTable({
    jobId: v.id("generationJobs"),
    url: v.string(),
    title: v.string(),
    kind: sourceKindValidator,
    resourceId: v.optional(v.id("courseResources")),
    excerpt: v.optional(v.string()),
  })
    .index("by_job", ["jobId"])
    .index("by_job_url", ["jobId", "url"]),
});
