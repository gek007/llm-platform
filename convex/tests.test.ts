/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;
const asUser = (t: T, id = "user_1") =>
  t.withIdentity({ subject: id, issuer, name: id });
const asAdmin = (t: T) => t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });

async function seed(
  t: T,
  opts: { tier?: "free" | "pro"; status?: "draft" | "published"; maxAttempts?: number } = {},
) {
  return await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      slug: "c", title: "C", summary: "s", description: "d", level: "beginner",
      tier: opts.tier ?? "free", status: opts.status ?? "published",
      tags: [], outcomes: [], order: 1,
    });
    const chapterId = await ctx.db.insert("chapters", {
      courseId, slug: "ch-1", title: "One", summary: "s", order: 1,
    });
    const testId = await ctx.db.insert("chapterTests", {
      courseId, chapterId, version: 2, passPercent: 70, maxAttempts: opts.maxAttempts ?? 3,
      questions: [
        { id: "q1", kind: "true_false", prompt: "p1", options: ["T", "F"], correct: [0], explanation: "e1" },
        { id: "q2", kind: "multiple", prompt: "p2", options: ["a", "b", "c"], correct: [0, 2], explanation: "e2" },
      ],
    });
    return { courseId, testId };
  });
}

const right = { q1: [0], q2: [0, 2] };
const wrong = { q1: [1], q2: [1] };
const attemptCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("testAttempts").collect()).length);

describe("tests.getForViewer", () => {
  it("returns null signed out, and for draft (learner) or pro-locked", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    expect(await t.query(api.tests.getForViewer, { testId })).toBeNull();
    const d = makeT();
    const s = await seed(d, { status: "draft" });
    expect(await asUser(d).query(api.tests.getForViewer, { testId: s.testId })).toBeNull();
    expect(await asAdmin(d).query(api.tests.getForViewer, { testId: s.testId })).not.toBeNull();
    const p = makeT();
    const ps = await seed(p, { tier: "pro" });
    expect(await asUser(p).query(api.tests.getForViewer, { testId: ps.testId })).toBeNull();
  });

  it("payload has no correct answers or explanations", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    const res = await asUser(t).query(api.tests.getForViewer, { testId });
    expect(res).toMatchObject({
      testId, version: 2, passPercent: 70, maxAttempts: 3, attemptsUsed: 0, best: null, language: "en",
    });
    expect(res?.questions).toHaveLength(2);
    const json = JSON.stringify(res);
    expect(json).not.toContain("correct");
    expect(json).not.toContain("explanation");
  });
});

describe("tests.submit", () => {
  it("records an attempt with testVersion, returns results and enrolls", async () => {
    const t = makeT();
    const { testId, courseId } = await seed(t);
    const res = await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: right });
    expect(res.scorePercent).toBe(100);
    expect(res.passed).toBe(true);
    expect(res.attemptsLeft).toBe(2);
    expect(res.results[1]).toEqual({ id: "q2", correct: true, correctOptions: [0, 2], explanation: "e2" });
    const rows = await t.run(async (ctx) => ({
      attempts: await ctx.db.query("testAttempts").collect(),
      enrollments: await ctx.db.query("enrollments").collect(),
    }));
    expect(rows.attempts).toHaveLength(1);
    expect(rows.attempts[0]).toMatchObject({ testVersion: 2, courseId, userId: "user_1", answers: [[0], [0, 2]] });
    expect(rows.enrollments).toHaveLength(1);
  });

  it("rejects the 4th attempt when maxAttempts is 3", async () => {
    const t = makeT();
    const { testId } = await seed(t, { maxAttempts: 3 });
    for (let i = 0; i < 3; i++) {
      await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: wrong });
    }
    await expect(
      asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: right }),
    ).rejects.toThrow(/NO_ATTEMPTS_LEFT/);
    expect(await attemptCount(t)).toBe(3);
  });

  it("rejects a wrong version with TEST_CHANGED and inserts nothing", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    await expect(
      asUser(t).mutation(api.tests.submit, { testId, version: 1, answers: right }),
    ).rejects.toThrow(/TEST_CHANGED/);
    expect(await attemptCount(t)).toBe(0);
  });

  it("rejects a bad option index with INVALID_ANSWERS and inserts nothing", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    await expect(
      asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: { q1: [5] } }),
    ).rejects.toThrow(/INVALID_ANSWERS/);
    expect(await attemptCount(t)).toBe(0);
  });

  it("rejects a non-array answer with INVALID_ANSWERS and inserts nothing", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    await expect(
      asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: { q1: 0 } as never }),
    ).rejects.toThrow(/INVALID_ANSWERS/);
    expect(await attemptCount(t)).toBe(0);
  });

  it("keeps the best attempt after a worse retake", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: right });
    const second = await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: wrong });
    expect(second.passed).toBe(false);
    expect(second.attemptsLeft).toBe(1);
    const res = await asUser(t).query(api.tests.getForViewer, { testId });
    expect(res?.best).toEqual({ scorePercent: 100, passed: true });
    expect(res?.attemptsUsed).toBe(2);
  });

  it("errors: signed out, draft for learner, pro for free user", async () => {
    const t = makeT();
    const { testId } = await seed(t);
    await expect(t.mutation(api.tests.submit, { testId, version: 2, answers: right })).rejects.toThrow(/UNAUTHENTICATED/);
    const d = makeT();
    const ds = await seed(d, { status: "draft" });
    await expect(
      asUser(d).mutation(api.tests.submit, { testId: ds.testId, version: 2, answers: right }),
    ).rejects.toThrow(/NOT_FOUND/);
    const p = makeT();
    const ps = await seed(p, { tier: "pro" });
    await expect(
      asUser(p).mutation(api.tests.submit, { testId: ps.testId, version: 2, answers: right }),
    ).rejects.toThrow(/LOCKED/);
  });
});

describe("tests.resultsForCourse", () => {
  it("is admin only", async () => {
    const t = makeT();
    const { courseId } = await seed(t);
    await expect(asUser(t).query(api.tests.resultsForCourse, { courseId })).rejects.toThrow(/FORBIDDEN/);
  });

  it("lists users with attempts, tests and cells", async () => {
    const t = makeT();
    const { courseId, testId } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_1", name: "Ada", email: "a@x.io" });
    });
    await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: wrong });
    await asUser(t).mutation(api.tests.submit, { testId, version: 2, answers: right });
    const res = await asAdmin(t).query(api.tests.resultsForCourse, { courseId });
    expect(res.users).toEqual([{ userId: "user_1", name: "Ada", email: "a@x.io" }]);
    expect(res.tests).toEqual([{ testId, chapterTitle: "One" }]);
    expect(res.cells).toEqual([{ userId: "user_1", testId, bestScore: 100, passed: true, attempts: 2 }]);
  });
});
