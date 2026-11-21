import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  })
    .index("by_course_order", ["courseId", "order"])
    .index("by_course_slug", ["courseId", "slug"])
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
});
