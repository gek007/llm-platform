/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);

const issuer = "https://example.clerk.accounts.dev";
const asUser = (t: ReturnType<typeof makeT>, extra: Record<string, unknown> = {}) =>
  t.withIdentity({ subject: "user_1", issuer, name: "Ada", ...extra });
const proClaims = { pla: "u:pro" };
const adminClaims = { metadata: { role: "admin" } };

function makeT() {
  return convexTest(schema, modules);
}

describe("seed + catalog", () => {
  it("seeds idempotently and lists published courses with stats", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    await t.mutation(internal.seed.run, {});
    const list = await t.query(api.courses.listPublished, {});
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.map((c) => c.order)).toEqual([...list.map((c) => c.order)].sort((a, b) => a - b));
    const pro = list.find((c) => c.tier === "pro")!;
    expect(pro.lessonCount).toBeGreaterThan(0);
    expect(pro.previewCount).toBeGreaterThan(0);
    expect(pro.durationMinutes).toBeGreaterThan(0);
  });
});

describe("gating", () => {
  it("never returns body to a signed-out viewer of a pro lesson, but does for a preview", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const locked = await t.query(api.lessons.getForViewer, {
      courseSlug: "react-server-components",
      lessonSlug: "the-client-boundary",
    });
    expect(locked?.locked).toBe(true);
    expect(locked?.lesson).not.toHaveProperty("body");
    expect(locked?.lesson).not.toHaveProperty("muxPlaybackId");

    const preview = await t.query(api.lessons.getForViewer, {
      courseSlug: "react-server-components",
      lessonSlug: "the-mental-model",
    });
    expect(preview?.locked).toBe(false);
    expect(preview?.lesson.body).toContain("```quiz");
    // The playback ID never leaves via getForViewer; video needs a signed token from the action.
    expect(preview?.lesson).not.toHaveProperty("muxPlaybackId");
  });

  it("unlocks pro lessons for pro members via the pla claim and for admins", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const args = { courseSlug: "react-server-components", lessonSlug: "the-client-boundary" };
    const free = await asUser(t).query(api.lessons.getForViewer, args);
    expect(free?.locked).toBe(true);
    const pro = await asUser(t, proClaims).query(api.lessons.getForViewer, args);
    expect(pro?.locked).toBe(false);
    expect(pro?.lesson.body).toBeTruthy();
    const admin = await asUser(t, adminClaims).query(api.lessons.getForViewer, args);
    expect(admin?.locked).toBe(false);
  });

  it("marks outline entries locked per viewer", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const anon = await t.query(api.courses.getBySlug, { slug: "react-server-components" });
    expect(anon?.lessons.filter((l) => l.locked).length).toBeGreaterThan(0);
    expect(anon?.lessons.find((l) => l.isFreePreview)?.locked).toBe(false);
    const pro = await asUser(t, proClaims).query(api.courses.getBySlug, {
      slug: "react-server-components",
    });
    expect(pro?.lessons.every((l) => !l.locked)).toBe(true);
  });
});

describe("enrollment and progress", () => {
  it("requires Pro to enroll in a pro course, and enroll is idempotent for free courses", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const courses = await t.query(api.courses.listPublished, {});
    const proCourse = courses.find((c) => c.tier === "pro")!;
    const freeCourse = courses.find((c) => c.tier === "free")!;

    await expect(
      asUser(t).mutation(api.enrollments.enroll, { courseId: proCourse._id }),
    ).rejects.toThrow(/PRO_REQUIRED/);
    await expect(
      t.mutation(api.enrollments.enroll, { courseId: freeCourse._id }),
    ).rejects.toThrow(/UNAUTHENTICATED/);

    const a = await asUser(t).mutation(api.enrollments.enroll, { courseId: freeCourse._id });
    const b = await asUser(t).mutation(api.enrollments.enroll, { courseId: freeCourse._id });
    expect(a).toEqual(b);
    expect(await asUser(t).query(api.enrollments.isEnrolled, { courseId: freeCourse._id })).toBe(true);
    await asUser(t, proClaims).mutation(api.enrollments.enroll, { courseId: proCourse._id });
  });

  it("marks lessons complete, auto-enrolls, reports progress, and blocks locked lessons", async () => {
    const t = makeT();
    await t.mutation(internal.seed.run, {});
    const course = (await t.query(api.courses.getBySlug, { slug: "typescript-foundations" }))!;
    const [first] = course.lessons;

    await asUser(t).mutation(api.progress.setComplete, { lessonId: first._id, complete: true });
    expect(await asUser(t).query(api.progress.forCourse, { courseId: course._id })).toEqual([
      first._id,
    ]);
    const mine = await asUser(t).query(api.enrollments.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ completedCount: 1, lessonCount: course.lessons.length });
    expect(mine[0].nextLessonSlug).toBe(course.lessons[1].slug);

    await asUser(t).mutation(api.progress.setComplete, { lessonId: first._id, complete: false });
    expect(await asUser(t).query(api.progress.forCourse, { courseId: course._id })).toEqual([]);

    const proCourse = (await t.query(api.courses.getBySlug, { slug: "react-server-components" }))!;
    const lockedLesson = proCourse.lessons.find((l) => l.locked)!;
    await expect(
      asUser(t).mutation(api.progress.setComplete, { lessonId: lockedLesson._id, complete: true }),
    ).rejects.toThrow(/LOCKED/);
  });
});

describe("users and viewer", () => {
  it("upserts the user and reports viewer state", async () => {
    const t = makeT();
    expect(await t.query(api.viewer.get, {})).toMatchObject({
      signedIn: false,
      isAdmin: false,
      isPro: false,
      user: null,
    });
    await asUser(t).mutation(api.users.store, { email: "ada@example.com" });
    await asUser(t).mutation(api.users.store, { name: "Ada L" });
    const viewer = await asUser(t, { ...proClaims, ...adminClaims }).query(api.viewer.get, {});
    expect(viewer).toMatchObject({ signedIn: true, isAdmin: true, isPro: true });
    expect(viewer.user).toMatchObject({ clerkId: "user_1", name: "Ada L", email: "ada@example.com" });
  });
});
