import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { deepEqual, invalid, requireText, TEXT_LIMIT, validateSlide, validateTestQuestion } from "./lib/contentValidation";
import { languageValidator, questionValidator, slideValidator } from "./lib/engineTypes";
import { courseStatusValidator, levelValidator, tierValidator } from "./schema";

/**
 * Admin API. Every function starts with `requireAdmin` (Clerk `publicMetadata.role === "admin"`
 * from the session token). Errors are `ConvexError` strings: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND,
 * INVALID_SLUG, SLUG_TAKEN, INVALID_TITLE, INVALID_DURATION, INVALID_REORDER.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebabCase(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

const courseFields = {
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
  order: v.optional(v.number()),
};

const lessonFields = {
  slug: v.string(),
  title: v.string(),
  summary: v.string(),
  body: v.string(),
  durationMinutes: v.number(),
  isFreePreview: v.boolean(),
};

function cleanList(list: string[]) {
  return list.map((item) => item.trim()).filter(Boolean);
}

function cleanCover(url: string | undefined) {
  const trimmed = url?.trim();
  return trimmed ? trimmed : undefined;
}

function validateCommon(slug: string, title: string) {
  if (!isKebabCase(slug)) throw new ConvexError("INVALID_SLUG");
  if (!title.trim()) throw new ConvexError("INVALID_TITLE");
}

async function assertCourseSlugFree(ctx: MutationCtx, slug: string, ignore?: Id<"courses">) {
  const existing = await ctx.db
    .query("courses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing && existing._id !== ignore) throw new ConvexError("SLUG_TAKEN");
}

async function assertLessonSlugFree(
  ctx: MutationCtx,
  courseId: Id<"courses">,
  slug: string,
  ignore?: Id<"lessons">,
) {
  const existing = await ctx.db
    .query("lessons")
    .withIndex("by_course_slug", (q) => q.eq("courseId", courseId).eq("slug", slug))
    .unique();
  if (existing && existing._id !== ignore) throw new ConvexError("SLUG_TAKEN");
}

function assertDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0) throw new ConvexError("INVALID_DURATION");
}

export const listCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const courses = await ctx.db.query("courses").collect();
    courses.sort((a, b) => a.order - b.order);
    return await Promise.all(
      courses.map(async (course) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
          .collect();
        return { ...course, lessonCount: lessons.length };
      }),
    );
  },
});

export const getCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(courseId);
    if (!course) return null;
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    return { course, lessons };
  },
});

export const getLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;
    const course = await ctx.db.get(lesson.courseId);
    if (!course) return null;
    return { lesson, course: { _id: course._id, slug: course.slug, title: course.title } };
  },
});

export const createCourse = mutation({
  args: courseFields,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    validateCommon(args.slug, args.title);
    await assertCourseSlugFree(ctx, args.slug);
    let order = args.order;
    if (order === undefined) {
      const all = await ctx.db.query("courses").collect();
      order = all.reduce((max, c) => Math.max(max, c.order), 0) + 1;
    }
    return await ctx.db.insert("courses", {
      ...args,
      title: args.title.trim(),
      tags: cleanList(args.tags),
      outcomes: cleanList(args.outcomes),
      coverImageUrl: cleanCover(args.coverImageUrl),
      order,
    });
  },
});

export const updateCourse = mutation({
  args: { courseId: v.id("courses"), ...courseFields, language: v.optional(languageValidator) },
  handler: async (ctx, { courseId, language, ...args }) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(courseId);
    if (!course) throw new ConvexError("NOT_FOUND");
    validateCommon(args.slug, args.title);
    await assertCourseSlugFree(ctx, args.slug, courseId);
    await ctx.db.patch(courseId, {
      ...args,
      language: language ?? course.language,
      title: args.title.trim(),
      tags: cleanList(args.tags),
      outcomes: cleanList(args.outcomes),
      // `undefined` removes the optional field, so a cleared cover URL is cleared.
      coverImageUrl: cleanCover(args.coverImageUrl),
      order: args.order ?? course.order,
    });
  },
});

/**
 * Deleting a course cascades: its lessons, enrollments and lesson progress are deleted too.
 * (Mux assets live outside Convex; the admin UI removes lesson videos before deleting.)
 */
export const deleteCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(courseId);
    if (!course) throw new ConvexError("NOT_FOUND");
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    for (const lesson of lessons) await ctx.db.delete(lesson._id);
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
    for (const enrollment of enrollments) await ctx.db.delete(enrollment._id);
    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
    for (const row of progress) await ctx.db.delete(row._id);
    await ctx.db.delete(courseId);
    return { lessons: lessons.length, enrollments: enrollments.length, progress: progress.length };
  },
});

export const createLesson = mutation({
  args: { courseId: v.id("courses"), ...lessonFields },
  handler: async (ctx, { courseId, ...args }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(courseId))) throw new ConvexError("NOT_FOUND");
    validateCommon(args.slug, args.title);
    assertDuration(args.durationMinutes);
    await assertLessonSlugFree(ctx, courseId, args.slug);
    const existing = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    const order = existing.reduce((max, l) => Math.max(max, l.order), 0) + 1;
    return await ctx.db.insert("lessons", {
      ...args,
      title: args.title.trim(),
      courseId,
      order,
    });
  },
});

export const updateLesson = mutation({
  args: { lessonId: v.id("lessons"), ...lessonFields },
  handler: async (ctx, { lessonId, ...args }) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new ConvexError("NOT_FOUND");
    validateCommon(args.slug, args.title);
    assertDuration(args.durationMinutes);
    await assertLessonSlugFree(ctx, lesson.courseId, args.slug, lessonId);
    await ctx.db.patch(lessonId, { ...args, title: args.title.trim() });
  },
});

/** Deletes a lesson, its progress rows, and closes the gap in the course's lesson order. */
export const deleteLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new ConvexError("NOT_FOUND");
    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const row of progress) await ctx.db.delete(row._id);
    await ctx.db.delete(lessonId);
    const rest = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", lesson.courseId))
      .collect();
    for (const [index, other] of rest.entries()) {
      if (other.order !== index + 1) await ctx.db.patch(other._id, { order: index + 1 });
    }
  },
});

/** `lessonIds` must be exactly the course's lessons; they get order 1..n in the given sequence. */
export const reorderLessons = mutation({
  args: { courseId: v.id("courses"), lessonIds: v.array(v.id("lessons")) },
  handler: async (ctx, { courseId, lessonIds }) => {
    await requireAdmin(ctx);
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    const known = new Set<string>(lessons.map((l) => l._id));
    const given = new Set<string>(lessonIds);
    if (given.size !== lessonIds.length || given.size !== known.size || ![...given].every((id) => known.has(id))) {
      throw new ConvexError("INVALID_REORDER");
    }
    for (const [index, id] of lessonIds.entries()) await ctx.db.patch(id, { order: index + 1 });
  },
});

// ---------------------------------------------------------------------------------------------
// Content editing (chapters, slide decks, chapter tests). One deck row and one test row per chapter:
// edits patch the existing row. Hand edits are by trusted admins, so no source-integrity scan runs
// (unlike the engine saves); text is still checked for emptiness and length.
// ---------------------------------------------------------------------------------------------

const HAND_EDIT = { minSlides: 6, maxSlides: 20, maxQuestions: 50, maxAttemptsCap: 20 } as const;

export const listChapters = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    await requireAdmin(ctx);
    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    return await Promise.all(
      chapters.map(async (chapter) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_chapter_order", (q) => q.eq("chapterId", chapter._id))
          .collect();
        const deck = await ctx.db
          .query("slideDecks")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .unique();
        const test = await ctx.db
          .query("chapterTests")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .unique();
        return {
          _id: chapter._id,
          slug: chapter.slug,
          title: chapter.title,
          summary: chapter.summary,
          order: chapter.order,
          lessons: lessons.map((l) => ({ _id: l._id, title: l.title, order: l.order })),
          hasDeck: deck !== null,
          test: test && {
            _id: test._id,
            version: test.version,
            questionCount: test.questions.length,
            passPercent: test.passPercent,
            maxAttempts: test.maxAttempts,
          },
        };
      }),
    );
  },
});

export const updateChapter = mutation({
  args: { chapterId: v.id("chapters"), title: v.optional(v.string()), summary: v.optional(v.string()) },
  handler: async (ctx, { chapterId, title, summary }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(chapterId))) throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(chapterId, {
      ...(title !== undefined && { title: requireText(title, "title", 300) }),
      ...(summary !== undefined && { summary: summary.trim().slice(0, TEXT_LIMIT) }),
    });
  },
});

export const getDeck = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("slideDecks")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .unique();
  },
});

/** Full test including `correct` and `explanation` (admin only). */
export const getTest = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("chapterTests")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .unique();
  },
});

export const updateDeck = mutation({
  args: { chapterId: v.id("chapters"), slides: v.array(slideValidator) },
  handler: async (ctx, { chapterId, slides }) => {
    await requireAdmin(ctx);
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new ConvexError("NOT_FOUND");
    if (slides.length < HAND_EDIT.minSlides || slides.length > HAND_EDIT.maxSlides) {
      invalid(`a deck needs ${HAND_EDIT.minSlides}-${HAND_EDIT.maxSlides} slides, got ${slides.length}`);
    }
    slides.forEach((s, i) => validateSlide(s, i + 1));
    const deck = await ctx.db
      .query("slideDecks")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .unique();
    if (deck) await ctx.db.patch(deck._id, { slides, updatedAt: Date.now() });
    else {
      await ctx.db.insert("slideDecks", { courseId: chapter.courseId, chapterId, slides, updatedAt: Date.now() });
    }
  },
});

/** Bumps `version` in place only when `questions` actually change; attempts keep their version. */
export const updateTest = mutation({
  args: {
    chapterId: v.id("chapters"),
    questions: v.optional(v.array(questionValidator)),
    passPercent: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, { chapterId, questions, passPercent, maxAttempts }) => {
    await requireAdmin(ctx);
    const test = await ctx.db
      .query("chapterTests")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .unique();
    if (!test) throw new ConvexError("NOT_FOUND");
    if (passPercent !== undefined && (!Number.isInteger(passPercent) || passPercent < 1 || passPercent > 100)) {
      invalid("passPercent must be an integer from 1 to 100");
    }
    if (
      maxAttempts !== undefined &&
      (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > HAND_EDIT.maxAttemptsCap)
    ) {
      invalid(`maxAttempts must be an integer from 1 to ${HAND_EDIT.maxAttemptsCap}`);
    }
    let version = test.version;
    if (questions !== undefined) {
      if (questions.length < 1 || questions.length > HAND_EDIT.maxQuestions) {
        invalid(`a test needs 1-${HAND_EDIT.maxQuestions} questions, got ${questions.length}`);
      }
      questions.forEach(validateTestQuestion);
      const ids = questions.map((q) => q.id.trim());
      if (new Set(ids).size !== ids.length) invalid("question ids must be unique");
      if (!deepEqual(test.questions, questions)) version += 1;
    }
    await ctx.db.patch(test._id, {
      ...(questions !== undefined && { questions, version }),
      ...(passPercent !== undefined && { passPercent }),
      ...(maxAttempts !== undefined && { maxAttempts }),
    });
    return { version };
  },
});
