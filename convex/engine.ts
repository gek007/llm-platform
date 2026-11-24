import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { deepEqual, requireText, TEXT_LIMIT, validateTestQuestion } from "./lib/contentValidation";
import { DECK_RULES, deckDraftSchema, deckTexts, formatIssues } from "./lib/deck";
import {
  eventKindValidator,
  outlineValidator,
  questionValidator,
  readStatusValidator,
  slideValidator,
  sourceKindValidator,
  CHAPTER_BODY_CAP,
  TEST_DEFAULTS,
  type ChapterContent,
  type JobBrief,
  type JobStatus,
} from "./lib/engineTypes";
import { logEvent, transition, validateOutline, type JobCtx } from "./lib/jobs";
import {
  findResourceBlockIds,
  findUnknownRefs,
  findUnknownRefsInText,
  normalizeUrl,
  type KnownRefs,
} from "./lib/sourceScan";
import { youtubeIdFromUrl } from "../src/components/markdown/embeds";

/**
 * Engine API: the only way the course-builder agent (and the fake engine) touches the database.
 * Internal functions, reached through the secret-guarded `/engine/<op>` HTTP action in http.ts,
 * which turns a thrown `ConvexError(string)` into `400 { ok: false, error }`.
 *
 * Errors are `ConvexError` strings `"<CODE>: <detail>"` (NOT_FOUND, BAD_STATE, INVALID, INCOMPLETE)
 * except unknown references, which read `"Unknown reference: <ref>[, <ref>…]"`. The detail is meant
 * for the agent so it can fix and retry.
 *
 * State rules (status a call needs; a `failed` job resumes to its phase and logs "Resumed"):
 * - research: setResourceStatus, saveOutline → `researching` (failed before approval resumes there).
 * - saveSources → `researching` or `writing` (writers may cite new sources); reportProgress also
 *   in `outline_ready` (the research phase reports its outline after saving it).
 * - content: saveSubchapter, saveDeck, saveTest, finishJob → `writing` (failed after approval
 *   resumes there). `ready` is refused: a regenerate moves the job back to `writing` first.
 * - The job's course must still be a draft for content writes and for any failed → writing resume
 *   (BAD_STATE "Course is published; …"), so AI content never lands in a live course.
 * - failJob → any non-terminal status; on an already failed job it just records the new error.
 * - getJob, getChapterContent → read-only, any status (getChapterContent needs the course).
 * Every write logs a `generationEvents` row (the watchdog's liveness signal); content writes do not
 * patch the job doc, so parallel chapter writers do not conflict on it.
 *
 * Idempotency: sources upsert by (jobId, normalized url); a subchapter is the lesson at
 * `subchapterOrder` within chapter `chapterOrder`; decks and tests upsert by chapterId (one row
 * each); a test's `version` bumps only when its questions change; a replayed identical outline
 * on an `outline_ready` job is a no-op.
 */

const LIMITS = {
  title: 300,
  summary: 2_000,
  body: 100_000,
  message: 2_000,
  excerpt: 5_000,
  text: TEXT_LIMIT,
  sourcesPerCall: 50,
  sourceIdsPerLesson: 50,
  minSlides: DECK_RULES.minSlides,
  maxSlides: DECK_RULES.maxSlides,
  minQuestions: 8,
  maxQuestions: 10,
  maxDurationMinutes: 240,
} as const;

const NON_TERMINAL: JobStatus[] = ["queued", "researching", "outline_ready", "writing"];

function fail(code: "NOT_FOUND" | "BAD_STATE" | "INVALID" | "INCOMPLETE", detail: string): never {
  throw new ConvexError(`${code}: ${detail}`);
}

function requireOrder(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) fail("INVALID", `${field} must be a positive integer`);
}

async function loadJob(ctx: Pick<QueryCtx, "db">, jobId: string) {
  const id = ctx.db.normalizeId("generationJobs", jobId);
  const job = id ? await ctx.db.get(id) : null;
  if (!job) fail("NOT_FOUND", `job ${jobId.slice(0, 64)}`);
  return job;
}

/**
 * Admits a call allowed in `allowed`. A `failed` job resumes to its phase (`writing` once the outline
 * was approved, i.e. it has a course; else `researching`) when that phase is allowed — late agent
 * writes after the watchdog failed the job are accepted. Otherwise BAD_STATE.
 * `content` marks ops that write course content (lessons, decks, tests, finishing).
 */
async function enter(
  ctx: JobCtx,
  job: Doc<"generationJobs">,
  op: string,
  allowed: JobStatus[],
  { content = false }: { content?: boolean } = {},
): Promise<Doc<"generationJobs">> {
  const phase: JobStatus = job.courseId ? "writing" : "researching";
  const resumes = job.status === "failed" && allowed.includes(phase);
  const target = allowed.includes(job.status) ? job.status : resumes ? phase : null;
  if (target === null) fail("BAD_STATE", `${op} is not allowed while the job is ${job.status}`);
  // AI content reaches learners only through an admin publishing it: once the course is no longer
  // a draft, content writes and the failed -> writing resume are refused, before anything is written.
  if (target === "writing" && (content || resumes)) await requireDraftCourse(ctx, job);
  if (resumes) {
    await transition(ctx, job, ["failed"], phase, { error: undefined });
    await logEvent(ctx, job._id, "info", `Resumed: ${op} after failure, back to ${phase}`);
    return { ...job, status: phase, error: undefined };
  }
  return job;
}

async function requireDraftCourse(ctx: JobCtx, job: Doc<"generationJobs">) {
  if (!job.courseId) fail("BAD_STATE", "the job has no course");
  const course = await ctx.db.get(job.courseId);
  if (!course) fail("NOT_FOUND", "the job's course");
  if (course.status !== "draft") {
    fail("BAD_STATE", "Course is published; unpublish it to let the engine write");
  }
}

async function jobResources(ctx: Pick<QueryCtx, "db">, jobId: Id<"generationJobs">) {
  return await ctx.db
    .query("courseResources")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
}

async function jobSources(ctx: Pick<QueryCtx, "db">, jobId: Id<"generationJobs">) {
  return await ctx.db
    .query("generationSources")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
}

/**
 * What lesson content may reference: the job's sources plus its resources (admin resources count
 * as sources automatically; PDFs are placed with ```resource blocks). Pasted-text resources are
 * refused before this check (see rejectTextResourceBlocks).
 */
async function knownRefs(ctx: Pick<QueryCtx, "db">, jobId: Id<"generationJobs">): Promise<KnownRefs> {
  const known: KnownRefs = { urls: new Set(), videoIds: new Set(), resourceIds: new Set() };
  for (const s of await jobSources(ctx, jobId)) {
    known.urls.add(s.url);
    const id = s.kind === "youtube" ? youtubeIdFromUrl(s.url) : null;
    if (id) known.videoIds.add(id);
  }
  for (const r of await jobResources(ctx, jobId)) {
    known.resourceIds.add(r._id);
    const key = r.url ? normalizeUrl(r.url) : null;
    if (key) known.urls.add(key);
    const id = r.kind === "youtube" && r.url ? youtubeIdFromUrl(r.url) : null;
    if (id) known.videoIds.add(id);
  }
  return known;
}

/**
 * "No invented links" for one save: `markdown` is the lesson body (scanned as markdown, alone);
 * `texts` are plain-text fields, each scanned on its own (never joined, so markdown syntax in one
 * field can't hide a URL in another). Throws "Unknown reference: <ref>[, …]".
 */
function rejectUnknownRefs(
  known: KnownRefs,
  { markdown, texts = [] }: { markdown?: string; texts?: string[] },
) {
  const refs = new Set(markdown === undefined ? [] : findUnknownRefs(markdown, known));
  for (const text of texts) for (const ref of findUnknownRefsInText(text, known)) refs.add(ref);
  if (refs.size > 0) throw new ConvexError(`Unknown reference: ${[...refs].join(", ")}`);
}

const TEXT_RESOURCE_RULE =
  "is pasted text: source material only. Use its content in your own words; never place it with a ```resource block, never cite it as [n] and never put it in resourceIds";

/** Pasted-text resources are never shown to learners, so a ```resource block may not place one. */
async function rejectTextResourceBlocks(ctx: Pick<QueryCtx, "db">, jobId: Id<"generationJobs">, markdown: string) {
  const placed = new Set(findResourceBlockIds(markdown));
  if (placed.size === 0) return;
  for (const r of await jobResources(ctx, jobId)) {
    if (r.kind === "text" && placed.has(r._id)) fail("INVALID", `resource ${r._id} ${TEXT_RESOURCE_RULE}`);
  }
}

async function chapterOf(ctx: Pick<QueryCtx, "db">, job: Doc<"generationJobs">, chapterOrder: number) {
  requireOrder(chapterOrder, "chapterOrder");
  if (!job.courseId) fail("BAD_STATE", "the job has no course yet");
  const chapter = await ctx.db
    .query("chapters")
    .withIndex("by_course_order", (q) => q.eq("courseId", job.courseId!).eq("order", chapterOrder))
    .unique();
  if (!chapter) fail("NOT_FOUND", `chapter ${chapterOrder}`);
  return chapter;
}

async function chapterLessons(ctx: Pick<QueryCtx, "db">, chapterId: Id<"chapters">) {
  return await ctx.db
    .query("lessons")
    .withIndex("by_chapter_order", (q) => q.eq("chapterId", chapterId))
    .collect();
}

// ---------------------------------------------------------------------------------------------

export const getJob = internalQuery({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }): Promise<JobBrief> => {
    const job = await loadJob(ctx, jobId);
    const resources = await Promise.all(
      (await jobResources(ctx, job._id)).map(async (r) => ({
        id: r._id,
        kind: r.kind,
        title: r.title,
        url: r.url,
        fileUrl: r.storageId ? ((await ctx.storage.getUrl(r.storageId)) ?? undefined) : undefined,
        text: r.text,
        readStatus: r.readStatus,
      })),
    );
    const sources = (await jobSources(ctx, job._id)).map((s) => ({
      id: s._id,
      url: s.url,
      title: s.title,
      kind: s.kind,
      excerpt: s.excerpt,
    }));

    let course;
    if (job.courseId) {
      const courseId = job.courseId;
      const chapters = await ctx.db
        .query("chapters")
        .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
        .collect();
      course = {
        courseId,
        chapters: await Promise.all(
          chapters.map(async (ch) => {
            const deck = await ctx.db
              .query("slideDecks")
              .withIndex("by_chapter", (q) => q.eq("chapterId", ch._id))
              .first();
            const test = await ctx.db
              .query("chapterTests")
              .withIndex("by_chapter", (q) => q.eq("chapterId", ch._id))
              .first();
            return {
              order: ch.order,
              title: ch.title,
              summary: ch.summary,
              subchapters: (await chapterLessons(ctx, ch._id)).map((l, i) => ({
                order: i + 1,
                title: l.title,
                summary: l.summary,
                hasBody: l.body.trim() !== "",
              })),
              hasDeck: deck !== null,
              hasTest: test !== null,
            };
          }),
        ),
      };
    }

    return {
      jobId: job._id,
      status: job.status,
      topic: job.topic,
      language: job.language,
      level: job.level,
      length: job.length,
      audience: job.audience,
      notes: job.notes,
      resources,
      sources,
      outline: job.outline,
      course,
    };
  },
});

/**
 * One chapter's saved content for a regenerate (read-only, any status once the course exists):
 * lesson bodies capped at CHAPTER_BODY_CAP characters each, and as context only the deck's slide
 * titles and the test's question prompts (never `correct` or `explanation`). Scoped to the job's own
 * course (`chapterOf`): another job's chapters are unreachable.
 */
export const getChapterContent = internalQuery({
  args: { jobId: v.string(), chapterOrder: v.number() },
  handler: async (ctx, args): Promise<ChapterContent> => {
    const job = await loadJob(ctx, args.jobId);
    const chapter = await chapterOf(ctx, job, args.chapterOrder);
    const deck = await ctx.db
      .query("slideDecks")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .first();
    const test = await ctx.db
      .query("chapterTests")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .first();
    return {
      chapterOrder: chapter.order,
      title: chapter.title,
      lessons: (await chapterLessons(ctx, chapter._id)).map((l, i) => ({
        order: i + 1,
        title: l.title,
        body: l.body.slice(0, CHAPTER_BODY_CAP),
        truncated: l.body.length > CHAPTER_BODY_CAP,
      })),
      deckSlideTitles: deck?.slides.map((s) => s.title) ?? [],
      testPrompts: test?.questions.map((q) => q.prompt) ?? [],
    };
  },
});

export const setResourceStatus = internalMutation({
  args: {
    jobId: v.string(),
    resourceId: v.string(),
    readStatus: readStatusValidator,
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "setResourceStatus", ["researching"]);
    const id = ctx.db.normalizeId("courseResources", args.resourceId);
    const resource = id ? await ctx.db.get(id) : null;
    if (!resource || resource.jobId !== job._id) fail("NOT_FOUND", `resource ${args.resourceId}`);
    const title = args.title === undefined ? resource.title : requireText(args.title, "title", LIMITS.title);
    await ctx.db.patch(resource._id, { readStatus: args.readStatus, title });
    await logEvent(ctx, job._id, "source", `Resource "${title}": ${args.readStatus}`);
    return {};
  },
});

export const saveSources = internalMutation({
  args: {
    jobId: v.string(),
    sources: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        kind: sourceKindValidator,
        resourceId: v.optional(v.string()),
        excerpt: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "saveSources", ["researching", "writing"]);
    if (args.sources.length < 1 || args.sources.length > LIMITS.sourcesPerCall) {
      fail("INVALID", `send 1-${LIMITS.sourcesPerCall} sources per call`);
    }
    const saved: { id: Id<"generationSources">; url: string }[] = [];
    for (const s of args.sources) {
      // Sources render as links (lesson "Sources" list), so only absolute http(s) URLs are stored.
      const url = normalizeUrl(s.url);
      if (!url) fail("INVALID", `source url must be an absolute http(s) URL: ${s.url}`);
      if (s.kind === "youtube" && !youtubeIdFromUrl(url)) {
        fail("INVALID", `youtube source is not a YouTube video URL: ${s.url}`);
      }
      const title = requireText(s.title, "source title", LIMITS.title);
      if (s.excerpt && s.excerpt.length > LIMITS.excerpt) {
        fail("INVALID", `source excerpt is longer than ${LIMITS.excerpt} characters`);
      }
      let resourceId: Id<"courseResources"> | undefined;
      if (s.resourceId !== undefined) {
        const id = ctx.db.normalizeId("courseResources", s.resourceId);
        const resource = id ? await ctx.db.get(id) : null;
        if (!resource || resource.jobId !== job._id) fail("NOT_FOUND", `resource ${s.resourceId}`);
        resourceId = resource._id;
      }
      const fields = { title, kind: s.kind, resourceId, excerpt: s.excerpt?.trim() || undefined };
      const existing = await ctx.db
        .query("generationSources")
        .withIndex("by_job_url", (q) => q.eq("jobId", job._id).eq("url", url))
        .first();
      let id: Id<"generationSources">;
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        id = existing._id;
      } else {
        id = await ctx.db.insert("generationSources", { jobId: job._id, url, ...fields });
      }
      saved.push({ id, url });
    }
    await logEvent(ctx, job._id, "source", `Saved ${saved.length} source(s)`);
    return { sources: saved };
  },
});

export const saveOutline = internalMutation({
  args: { jobId: v.string(), outline: outlineValidator },
  handler: async (ctx, { jobId, outline }) => {
    const loaded = await loadJob(ctx, jobId);
    // A replayed identical outline is a no-op; a different one never overwrites admin edits.
    if (loaded.status === "outline_ready" && deepEqual(loaded.outline, outline)) return {};
    const job = await enter(ctx, loaded, "saveOutline", ["researching"]);
    try {
      validateOutline(outline);
    } catch {
      fail("INVALID", "an outline needs 1-10 chapters with 1-5 subchapters each");
    }
    const resources = await jobResources(ctx, job._id);
    const resourceIds = new Set(resources.map((r) => r._id as string));
    const textIds = new Set(resources.filter((r) => r.kind === "text").map((r) => r._id as string));
    const unknown = new Set<string>();
    for (const ch of outline.chapters) {
      requireText(ch.title, "chapter title", LIMITS.title);
      requireText(ch.goal, "chapter goal", LIMITS.summary);
      for (const s of ch.subchapters) {
        requireText(s.title, "subchapter title", LIMITS.title);
        requireText(s.goal, "subchapter goal", LIMITS.summary);
        for (const id of s.resourceIds ?? []) {
          if (textIds.has(id)) fail("INVALID", `resource ${id} ${TEXT_RESOURCE_RULE}`);
          if (!resourceIds.has(id)) unknown.add(`resource:${id}`);
        }
      }
    }
    if (unknown.size > 0) throw new ConvexError(`Unknown reference: ${[...unknown].join(", ")}`);
    await ctx.db.patch(job._id, { outline });
    await transition(ctx, job, ["researching"], "outline_ready");
    await logEvent(ctx, job._id, "outline", `Outline saved: ${outline.chapters.length} chapter(s)`);
    return {};
  },
});

export const reportProgress = internalMutation({
  args: {
    jobId: v.string(),
    kind: eventKindValidator,
    message: v.string(),
    chapterOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // outline_ready too: the research phase reports its outline right after save_outline (no
    // status change; only a failed job resumes, as for any write).
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "reportProgress", [
      "researching",
      "outline_ready",
      "writing",
    ]);
    const message = requireText(args.message, "message", LIMITS.message);
    if (args.chapterOrder !== undefined) requireOrder(args.chapterOrder, "chapterOrder");
    await logEvent(ctx, job._id, args.kind, message, args.chapterOrder);
    return {};
  },
});

export const saveSubchapter = internalMutation({
  args: {
    jobId: v.string(),
    chapterOrder: v.number(),
    subchapterOrder: v.number(),
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    durationMinutes: v.number(),
    sourceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "saveSubchapter", ["writing"], {
      content: true,
    });
    const chapter = await chapterOf(ctx, job, args.chapterOrder);
    requireOrder(args.subchapterOrder, "subchapterOrder");
    const lesson = (await chapterLessons(ctx, chapter._id))[args.subchapterOrder - 1];
    if (!lesson) fail("NOT_FOUND", `subchapter ${args.chapterOrder}.${args.subchapterOrder}`);

    const title = requireText(args.title, "title", LIMITS.title);
    const summary = requireText(args.summary, "summary", LIMITS.summary);
    requireText(args.body, "body", LIMITS.body);
    const minutes = args.durationMinutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > LIMITS.maxDurationMinutes) {
      fail("INVALID", `durationMinutes must be an integer from 1 to ${LIMITS.maxDurationMinutes}`);
    }
    if (args.sourceIds.length > LIMITS.sourceIdsPerLesson) fail("INVALID", "too many sourceIds");

    const sourceIds: Id<"generationSources">[] = [];
    for (const raw of args.sourceIds) {
      const id = ctx.db.normalizeId("generationSources", raw);
      const source = id ? await ctx.db.get(id) : null;
      if (!source || source.jobId !== job._id) fail("NOT_FOUND", `source ${raw} is not a source of this job`);
      if (!sourceIds.includes(source._id)) sourceIds.push(source._id);
    }
    await rejectTextResourceBlocks(ctx, job._id, args.body);
    // The body is markdown; title and summary are plain text (an invented URL there still counts).
    rejectUnknownRefs(await knownRefs(ctx, job._id), { markdown: args.body, texts: [title, summary] });

    await ctx.db.patch(lesson._id, {
      title,
      summary,
      body: args.body,
      durationMinutes: minutes,
      sourceIds,
    });
    await logEvent(
      ctx,
      job._id,
      "chapter",
      `Saved subchapter ${args.chapterOrder}.${args.subchapterOrder}: ${title}`,
      args.chapterOrder,
    );
    return { lessonId: lesson._id };
  },
});

export const saveDeck = internalMutation({
  args: {
    jobId: v.string(),
    chapterOrder: v.number(),
    title: v.optional(v.string()),
    slides: v.array(slideValidator),
  },
  handler: async (ctx, args) => {
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "saveDeck", ["writing"], {
      content: true,
    });
    const chapter = await chapterOf(ctx, job, args.chapterOrder);
    if (args.slides.length < LIMITS.minSlides || args.slides.length > LIMITS.maxSlides) {
      fail("INVALID", `a deck needs ${LIMITS.minSlides}-${LIMITS.maxSlides} slides, got ${args.slides.length}`);
    }
    // The deck schema (lib/deck.ts) is the authority for generated decks: shape, per-layout fields,
    // bullet limits, title first and summary last, unique slide ids. The share of slides with a
    // visual is the generator's rule and is not checked here: a diagram that could not be made
    // valid falls back to bullets, and that deck must still save.
    const draft = {
      title: args.title?.trim() || chapter.title.slice(0, DECK_RULES.titleChars),
      slides: args.slides,
    };
    const parsed = deckDraftSchema.safeParse(draft);
    if (!parsed.success) fail("INVALID", formatIssues(parsed.error, draft).join("; "));
    const { title, slides } = parsed.data;
    rejectUnknownRefs(await knownRefs(ctx, job._id), { texts: deckTexts(slides, title) });

    const existing = await ctx.db
      .query("slideDecks")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .unique();
    let deckId: Id<"slideDecks">;
    if (existing) {
      await ctx.db.patch(existing._id, { title, slides, updatedAt: Date.now() });
      deckId = existing._id;
    } else {
      deckId = await ctx.db.insert("slideDecks", {
        courseId: chapter.courseId,
        chapterId: chapter._id,
        title,
        slides,
        updatedAt: Date.now(),
      });
    }
    await logEvent(ctx, job._id, "chapter", `Saved slide deck (${slides.length} slides)`, args.chapterOrder);
    return { deckId };
  },
});

export const saveTest = internalMutation({
  args: { jobId: v.string(), chapterOrder: v.number(), questions: v.array(questionValidator) },
  handler: async (ctx, args) => {
    const job = await enter(ctx, await loadJob(ctx, args.jobId), "saveTest", ["writing"], {
      content: true,
    });
    const chapter = await chapterOf(ctx, job, args.chapterOrder);
    const { questions } = args;
    if (questions.length < LIMITS.minQuestions || questions.length > LIMITS.maxQuestions) {
      fail(
        "INVALID",
        `a test needs ${LIMITS.minQuestions}-${LIMITS.maxQuestions} questions, got ${questions.length}`,
      );
    }
    questions.forEach(validateTestQuestion);
    const ids = questions.map((q) => q.id.trim());
    if (new Set(ids).size !== ids.length) fail("INVALID", "question ids must be unique");
    const text = questions.flatMap((q) => [q.prompt, ...q.options, q.explanation]);
    rejectUnknownRefs(await knownRefs(ctx, job._id), { texts: text });

    // One row per chapter (attempts reference the stable testId); version bumps on real changes only.
    const existing = await ctx.db
      .query("chapterTests")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .unique();
    let testId: Id<"chapterTests">;
    let version = 1;
    if (existing) {
      testId = existing._id;
      version = existing.version;
      if (!deepEqual(existing.questions, questions)) {
        version += 1;
        await ctx.db.patch(existing._id, { questions, version });
      }
    } else {
      testId = await ctx.db.insert("chapterTests", {
        courseId: chapter.courseId,
        chapterId: chapter._id,
        version,
        ...TEST_DEFAULTS,
        questions,
      });
    }
    await logEvent(
      ctx,
      job._id,
      "chapter",
      `Saved test (${questions.length} questions, version ${version})`,
      args.chapterOrder,
    );
    return { testId, version };
  },
});

export const finishJob = internalMutation({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const loaded = await loadJob(ctx, jobId);
    if (loaded.status === "ready") return {}; // replayed finish
    const job = await enter(ctx, loaded, "finishJob", ["writing"], { content: true });
    if (!job.courseId) fail("BAD_STATE", "the job has no course");
    const courseId = job.courseId;
    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    const missing: string[] = [];
    if (chapters.length === 0) missing.push("the course has no chapters");
    for (const ch of chapters) {
      for (const lesson of await chapterLessons(ctx, ch._id)) {
        if (!lesson.body.trim()) missing.push(`Chapter ${ch.order}: lesson "${lesson.title}" has no body`);
      }
      const deck = await ctx.db
        .query("slideDecks")
        .withIndex("by_chapter", (q) => q.eq("chapterId", ch._id))
        .first();
      if (!deck) missing.push(`Chapter ${ch.order}: deck missing`);
      const test = await ctx.db
        .query("chapterTests")
        .withIndex("by_chapter", (q) => q.eq("chapterId", ch._id))
        .first();
      if (!test) missing.push(`Chapter ${ch.order}: test missing`);
    }
    if (missing.length > 0) fail("INCOMPLETE", missing.join("; "));
    await transition(ctx, job, ["writing"], "ready");
    return {};
  },
});

export const failJob = internalMutation({
  args: { jobId: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const job = await loadJob(ctx, args.jobId);
    const error = requireText(args.error, "error", LIMITS.message);
    if (job.status === "failed") {
      await ctx.db.patch(job._id, { error, updatedAt: Date.now() });
    } else if (NON_TERMINAL.includes(job.status)) {
      await transition(ctx, job, NON_TERMINAL, "failed", { error });
    } else {
      fail("BAD_STATE", `failJob is not allowed while the job is ${job.status}`);
    }
    await logEvent(ctx, job._id, "error", error);
    return {};
  },
});

const STALL_MS = 15 * 60 * 1000;

/**
 * Watchdog (cron): fails researching/writing jobs with no activity for 15 minutes so the admin can
 * "Retry phase". A later agent write to a failed job resumes it (see the engine save helpers).
 */
export const failStalledJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of ["researching", "writing"] as const) {
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const job of jobs) {
        const latest = await ctx.db
          .query("generationEvents")
          .withIndex("by_job_at", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first();
        const lastActivity = Math.max(latest?.at ?? 0, job.updatedAt);
        if (now - lastActivity <= STALL_MS) continue;
        const error = "No progress for 15 minutes";
        await transition(ctx, job, [status], "failed", { error });
        await logEvent(ctx, job._id, "error", error);
      }
    }
    return {};
  },
});
