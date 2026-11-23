import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessCourseContent } from "./lib/access";
import { getViewerState, requireAdmin, requireUser } from "./lib/auth";
import { ensureEnrolled } from "./lib/enrollment";
import { gradeTest, publicQuestions } from "./lib/grading";
import { attemptSummary } from "./lib/testAttempts";

export const getForViewer = query({
  args: { testId: v.id("chapterTests") },
  handler: async (ctx, { testId }) => {
    const viewer = await getViewerState(ctx);
    if (!viewer.subject) return null;
    const test = await ctx.db.get(testId);
    const course = test ? await ctx.db.get(test.courseId) : null;
    if (!test || !course) return null;
    if (course.status !== "published" && !viewer.admin) return null;
    // Locked (e.g. Pro course for a free user): no questions are served.
    if (!canAccessCourseContent({ course, ...viewer })) return null;
    const { best, attemptsUsed } = await attemptSummary(ctx, viewer.subject, test._id);
    return {
      testId: test._id,
      version: test.version,
      passPercent: test.passPercent,
      maxAttempts: test.maxAttempts,
      attemptsUsed,
      best,
      questions: publicQuestions(test.questions),
      language: course.language ?? "en",
    };
  },
});

export const submit = mutation({
  args: {
    testId: v.id("chapterTests"),
    version: v.number(),
    // v.any() so malformed shapes reach gradeTest and fail as INVALID_ANSWERS, not arg validation.
    answers: v.record(v.string(), v.any()),
  },
  handler: async (ctx, { testId, version, answers }) => {
    const identity = await requireUser(ctx);
    const viewer = await getViewerState(ctx);
    const test = await ctx.db.get(testId);
    const course = test ? await ctx.db.get(test.courseId) : null;
    if (!test || !course || (course.status !== "published" && !viewer.admin)) {
      throw new ConvexError("NOT_FOUND");
    }
    if (!canAccessCourseContent({ course, ...viewer })) throw new ConvexError("LOCKED");
    if (version !== test.version) throw new ConvexError("TEST_CHANGED");

    const userId = identity.subject;
    const { attemptsUsed } = await attemptSummary(ctx, userId, test._id);
    if (attemptsUsed >= test.maxAttempts) throw new ConvexError("NO_ATTEMPTS_LEFT");

    // Pure; throws INVALID_ANSWERS before anything is written.
    const graded = gradeTest(test.questions, answers, test.passPercent);

    await ensureEnrolled(ctx, userId, course._id);
    await ctx.db.insert("testAttempts", {
      userId,
      courseId: course._id,
      testId: test._id,
      testVersion: test.version,
      answers: test.questions.map((q) => (Object.hasOwn(answers, q.id) ? answers[q.id] : [])),
      scorePercent: graded.scorePercent,
      passed: graded.passed,
      submittedAt: Date.now(),
    });

    return {
      scorePercent: graded.scorePercent,
      passed: graded.passed,
      attemptsLeft: test.maxAttempts - (attemptsUsed + 1),
      results: graded.results.map((r, i) => ({
        id: r.id,
        correct: r.correct,
        correctOptions: test.questions[i].correct,
        explanation: test.questions[i].explanation,
      })),
    };
  },
});

export const resultsForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    await requireAdmin(ctx);
    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect();
    const testRows = await ctx.db
      .query("chapterTests")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
    const tests = chapters.flatMap((c) => {
      const row = testRows.find((t) => t.chapterId === c._id);
      return row ? [{ testId: row._id, chapterTitle: c.title }] : [];
    });

    const attempts = (
      await Promise.all(
        testRows.map((t) =>
          ctx.db
            .query("testAttempts")
            .withIndex("by_test", (q) => q.eq("testId", t._id))
            .collect(),
        ),
      )
    ).flat();

    const cellMap = new Map<
      string,
      { userId: string; testId: (typeof tests)[number]["testId"]; bestScore: number; passed: boolean; attempts: number }
    >();
    for (const a of attempts) {
      const key = `${a.userId}|${a.testId}`;
      const cell = cellMap.get(key) ?? {
        userId: a.userId, testId: a.testId, bestScore: 0, passed: false, attempts: 0,
      };
      cell.bestScore = Math.max(cell.bestScore, a.scorePercent);
      cell.passed = cell.passed || a.passed;
      cell.attempts += 1;
      cellMap.set(key, cell);
    }

    const userIds = [...new Set(attempts.map((a) => a.userId))];
    const users = await Promise.all(
      userIds.map(async (userId) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
          .unique();
        return { userId, name: user?.name ?? userId, email: user?.email };
      }),
    );
    return { users, tests, cells: [...cellMap.values()] };
  },
});
