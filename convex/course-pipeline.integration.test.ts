/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { runFakeEngine, type EngineCall } from "../src/lib/course-builder/fake-engine";

/**
 * The whole course pipeline in one run: admin creates a job, the engine (fake, over the real
 * /engine/* HTTP API) researches and writes, the admin publishes, and a learner takes the course
 * to completion. Checks the anti-goals on the way: nothing reaches a learner before publish, and
 * correct answers stay on the server until a submission.
 */

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const SECRET = "test-engine-secret-not-real";

beforeEach(() => {
  vi.stubEnv("COURSE_ENGINE_SECRET", SECRET);
});

describe("course pipeline: generate → publish → learn", () => {
  it("a generated course is hidden until published, then a learner can complete it", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });
    const learner = t.withIdentity({ subject: "learner_1", issuer });
    const call: EngineCall = async (op, body) => {
      const res = await t.fetch(`/engine/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error);
      return json;
    };

    // 1. Generate.
    const jobId = await admin.mutation(api.generation.createJob, {
      topic: "Basics of personal budgeting",
      language: "en",
      level: "beginner",
      length: "short",
    });
    await admin.mutation(api.generation.startJob, { jobId });
    await runFakeEngine({ action: "research", jobId }, call);
    await admin.mutation(api.generation.approveOutline, { jobId });
    await runFakeEngine({ action: "write", jobId }, call);
    const job = await admin.query(api.generation.get, { jobId });
    expect(job?.status).toBe("ready");
    const courseId = job!.courseId!;
    const course = (await t.run((ctx) => ctx.db.get(courseId)))!;
    expect(course.status).toBe("draft");

    // 2. Draft: invisible to learners, visible to the admin.
    expect(await learner.query(api.courses.getBySlug, { slug: course.slug })).toBeNull();
    expect(await admin.query(api.courses.getBySlug, { slug: course.slug })).not.toBeNull();
    const chapterRows = await t.run((ctx) =>
      ctx.db
        .query("chapters")
        .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
        .collect(),
    );
    expect(chapterRows.length).toBeGreaterThan(0);
    expect(
      await learner.query(api.chapters.getForViewer, {
        courseSlug: course.slug,
        chapterSlug: chapterRows[0].slug,
      }),
    ).toBeNull();
    await expect(learner.mutation(api.enrollments.enroll, { courseId })).rejects.toThrow(/NOT_FOUND/);

    // 3. Publish (the admin's course form saves every field).
    await admin.mutation(api.admin.updateCourse, {
      courseId,
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      description: course.description,
      level: course.level,
      tier: course.tier,
      status: "published",
      tags: course.tags,
      outcomes: course.outcomes,
      coverImageUrl: course.coverImageUrl,
      order: course.order,
      language: course.language,
    });

    // 4. Learn: enroll, read every chapter, complete every lesson, pass every test.
    await learner.mutation(api.enrollments.enroll, { courseId });
    const view = await learner.query(api.courses.getBySlug, { slug: course.slug });
    expect(view?.chapters.length).toBe(chapterRows.length);

    for (const chapter of chapterRows) {
      const page = await learner.query(api.chapters.getForViewer, {
        courseSlug: course.slug,
        chapterSlug: chapter.slug,
      });
      expect(page).not.toBeNull();
      expect(page!.test).not.toBeNull();

      const test = await learner.query(api.tests.getForViewer, { testId: page!.test!._id });
      expect(test).not.toBeNull();
      // Anti-goal: no answers or explanations before a submission.
      for (const q of test!.questions) {
        expect(q).not.toHaveProperty("correct");
        expect(q).not.toHaveProperty("explanation");
      }

      // A wrong attempt is recorded and fails.
      const wrong = await learner.mutation(api.tests.submit, {
        testId: test!.testId,
        version: test!.version,
        answers: {},
      });
      expect(wrong.passed).toBe(false);

      // The right answers, read server-side, pass.
      const row = (await t.run((ctx) => ctx.db.get(test!.testId)))!;
      const right = await learner.mutation(api.tests.submit, {
        testId: test!.testId,
        version: test!.version,
        answers: Object.fromEntries(row.questions.map((q) => [q.id, q.correct])),
      });
      expect(right).toMatchObject({ scorePercent: 100, passed: true });
    }

    const half = await learner.query(api.progress.courseCompletion, { courseId });
    expect(half).toMatchObject({ testsPassed: chapterRows.length, complete: false });

    const lessons = await t.run((ctx) =>
      ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
        .collect(),
    );
    for (const lesson of lessons) {
      await learner.mutation(api.progress.setComplete, { lessonId: lesson._id, complete: true });
    }

    const done = await learner.query(api.progress.courseCompletion, { courseId });
    expect(done).toEqual({
      lessonsDone: lessons.length,
      lessonCount: lessons.length,
      testsPassed: chapterRows.length,
      testCount: chapterRows.length,
      complete: true,
    });

    // 5. Published courses refuse engine writes.
    await expect(
      admin.mutation(api.generation.requestRegenerate, { jobId }),
    ).rejects.toThrow(/BAD_STATE/);
  });
});
