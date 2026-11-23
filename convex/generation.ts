import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import {
  PDF_MAX_BYTES,
  engineCommandValidator,
  languageValidator,
  lengthValidator,
  outlineValidator,
  resourceKindValidator,
} from "./lib/engineTypes";
import { logEvent, transition, validateOutline, type JobCtx } from "./lib/jobs";
import { chapterSlug, courseSlugFor, lessonSlug } from "./lib/slugs";
import { isSafeHttpUrl, youtubeIdFromUrl } from "../src/components/markdown/embeds";
import { levelValidator } from "./schema";

/**
 * Generation jobs: admin API. Errors are `ConvexError` strings: UNAUTHENTICATED, FORBIDDEN,
 * NOT_FOUND, BAD_STATE, INVALID_TOPIC, INVALID_OUTLINE, INVALID_RESOURCE, PDF_TOO_LARGE.
 * Carrying a message is not a convention here (payloads are plain codes), so BAD_STATE stays a bare
 * code and the UI/route maps it using `REGENERATE_PUBLISHED_MESSAGE`.
 * The length preset guides the agent only; admin outline edits are bounded by the hard caps.
 */

export const REGENERATE_PUBLISHED_MESSAGE = "Unpublish the course to regenerate";
const EVENTS_LIMIT = 200;

async function getJob(ctx: JobCtx, jobId: Id<"generationJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) throw new ConvexError("NOT_FOUND");
  return job;
}

export const createJob = mutation({
  args: {
    topic: v.string(),
    language: languageValidator,
    level: levelValidator,
    length: lengthValidator,
    audience: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const topic = args.topic.trim();
    if (!topic) throw new ConvexError("INVALID_TOPIC");
    const now = Date.now();
    return await ctx.db.insert("generationJobs", {
      createdBy: identity.subject,
      topic,
      language: args.language,
      level: args.level,
      length: args.length,
      audience: args.audience?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addResource = mutation({
  args: {
    jobId: v.id("generationJobs"),
    kind: resourceKindValidator,
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await getJob(ctx, args.jobId);
    if (job.status !== "queued") throw new ConvexError("BAD_STATE");
    const url = args.url?.trim();
    let title = args.title?.trim();
    if (args.kind === "url") {
      if (!url || !isSafeHttpUrl(url)) throw new ConvexError("INVALID_RESOURCE");
      title ||= new URL(url).hostname;
    } else if (args.kind === "youtube") {
      if (!url || !youtubeIdFromUrl(url)) throw new ConvexError("INVALID_RESOURCE");
      title ||= "YouTube video";
    } else if (args.kind === "pdf") {
      if (!args.storageId) throw new ConvexError("INVALID_RESOURCE");
      const file = await ctx.db.system.get(args.storageId);
      if (!file || file.contentType !== "application/pdf") throw new ConvexError("INVALID_RESOURCE");
      if (file.size > PDF_MAX_BYTES) throw new ConvexError("PDF_TOO_LARGE");
      title ||= "PDF document";
    } else {
      if (!args.text?.trim()) throw new ConvexError("INVALID_RESOURCE");
      title ||= "Text notes";
    }
    return await ctx.db.insert("courseResources", {
      jobId: args.jobId,
      kind: args.kind,
      title,
      url: args.kind === "url" || args.kind === "youtube" ? url : undefined,
      storageId: args.kind === "pdf" ? args.storageId : undefined,
      text: args.kind === "text" ? args.text : undefined,
      origin: "admin",
      readStatus: args.kind === "youtube" ? "embed_only" : "pending",
    });
  },
});

export const removeResource = mutation({
  args: { resourceId: v.id("courseResources") },
  handler: async (ctx, { resourceId }) => {
    await requireAdmin(ctx);
    const resource = await ctx.db.get(resourceId);
    if (!resource) throw new ConvexError("NOT_FOUND");
    const job = await getJob(ctx, resource.jobId);
    if (job.status !== "queued") throw new ConvexError("BAD_STATE");
    if (resource.storageId) await ctx.storage.delete(resource.storageId);
    await ctx.db.delete(resourceId);
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    return await ctx.db.get(jobId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("generationJobs").withIndex("by_createdAt").order("desc").take(100);
  },
});

/** Latest 200 events, returned in ascending `at` order. */
export const events = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    const latest = await ctx.db
      .query("generationEvents")
      .withIndex("by_job_at", (q) => q.eq("jobId", jobId))
      .order("desc")
      .take(EVENTS_LIMIT);
    return latest.reverse();
  },
});

/** Sources the agent saved for a job (admin live view). */
export const sources = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("generationSources")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .take(200);
  },
});

/** queued -> researching. A double-clicked Generate yields one transition; the second call is BAD_STATE. */
export const startJob = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    await transition(ctx, await getJob(ctx, jobId), ["queued"], "researching");
    await ctx.db.patch(jobId, { pendingCommand: undefined });
  },
});

/** ready -> writing, only while the job's course is still a draft. */
export const requestRegenerate = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    const job = await getJob(ctx, jobId);
    if (job.status !== "ready") throw new ConvexError("BAD_STATE");
    const course = job.courseId ? await ctx.db.get(job.courseId) : null;
    // Published/archived course: BAD_STATE (message: REGENERATE_PUBLISHED_MESSAGE).
    if (course && course.status !== "draft") throw new ConvexError("BAD_STATE");
    await transition(ctx, job, ["ready"], "writing");
    // The route records the new command next; until then Resume falls back to the status mapping.
    await ctx.db.patch(jobId, { pendingCommand: undefined });
  },
});

export const updateOutline = mutation({
  args: { jobId: v.id("generationJobs"), outline: outlineValidator },
  handler: async (ctx, { jobId, outline }) => {
    await requireAdmin(ctx);
    const job = await getJob(ctx, jobId);
    if (job.status !== "outline_ready") throw new ConvexError("BAD_STATE");
    validateOutline(outline);
    await ctx.db.patch(jobId, { outline, updatedAt: Date.now() });
  },
});

export const approveOutline = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    const job = await getJob(ctx, jobId);
    if (job.status !== "outline_ready" || !job.outline) throw new ConvexError("BAD_STATE");
    const outline = job.outline;
    validateOutline(outline);
    // Flip status first: concurrent double submit conflicts on the job doc and the loser retries into BAD_STATE.
    await transition(ctx, job, ["outline_ready"], "writing");

    const all = await ctx.db.query("courses").collect();
    const slug = courseSlugFor(job.topic, new Set(all.map((c) => c.slug)));
    const courseId = await ctx.db.insert("courses", {
      slug,
      title: job.topic,
      summary: job.topic,
      description: job.notes ?? job.topic,
      level: job.level,
      tier: "free",
      status: "draft",
      tags: [],
      outcomes: [],
      order: all.reduce((max, c) => Math.max(max, c.order), 0) + 1,
      language: job.language,
      generationJobId: jobId,
    });

    let lessonOrder = 0;
    for (const [ci, ch] of outline.chapters.entries()) {
      const chapterOrder = ci + 1;
      const chapterId = await ctx.db.insert("chapters", {
        courseId,
        slug: chapterSlug(chapterOrder),
        title: ch.title,
        summary: ch.goal,
        order: chapterOrder,
      });
      for (const [si, subch] of ch.subchapters.entries()) {
        await ctx.db.insert("lessons", {
          courseId,
          chapterId,
          slug: lessonSlug(chapterOrder, si + 1),
          title: subch.title,
          summary: subch.goal,
          body: "",
          order: ++lessonOrder,
          durationMinutes: 0,
          isFreePreview: false,
        });
      }
    }

    const resources = await ctx.db
      .query("courseResources")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    for (const r of resources) await ctx.db.patch(r._id, { courseId });
    await ctx.db.patch(jobId, { courseId, pendingCommand: undefined });
    return courseId;
  },
});

/**
 * Records the command the route is about to dispatch, so Resume re-sends exactly it (a regenerate
 * whose dispatch failed is retried as that regenerate, not as `write`).
 */
export const setPendingCommand = mutation({
  args: { jobId: v.id("generationJobs"), command: engineCommandValidator },
  handler: async (ctx, { jobId, command }) => {
    await requireAdmin(ctx);
    await getJob(ctx, jobId);
    if (command.jobId !== jobId) throw new ConvexError("BAD_STATE");
    await ctx.db.patch(jobId, { pendingCommand: command, updatedAt: Date.now() });
  },
});

/** A successful dispatch: saves the session and clears any earlier dispatch error. */
export const markDispatched = mutation({
  args: { jobId: v.id("generationJobs"), eveSessionId: v.string() },
  handler: async (ctx, { jobId, eveSessionId }) => {
    await requireAdmin(ctx);
    await getJob(ctx, jobId);
    await ctx.db.patch(jobId, { eveSessionId, dispatchError: undefined, updatedAt: Date.now() });
  },
});

export const markDispatchError = mutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    await requireAdmin(ctx);
    await getJob(ctx, jobId);
    await ctx.db.patch(jobId, { dispatchError: error, updatedAt: Date.now() });
    await logEvent(ctx, jobId, "error", `Dispatch failed: ${error}`);
  },
});
