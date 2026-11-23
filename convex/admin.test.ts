/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isKebabCase } from "./admin";
import { mapMuxEvent, patchFromPolled, verifyMuxSignature } from "./muxData";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";

function makeT() {
  return convexTest(schema, modules);
}
const asAdmin = (t: ReturnType<typeof makeT>) =>
  t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });
const asUser = (t: ReturnType<typeof makeT>) =>
  t.withIdentity({ subject: "user_1", issuer, metadata: { role: "student" } });

const course = {
  slug: "intro-to-go",
  title: "Intro to Go",
  summary: "s",
  description: "d",
  level: "beginner" as const,
  tier: "free" as const,
  status: "draft" as const,
  tags: [" go ", ""],
  outcomes: ["Write Go", "  "],
};
const lesson = {
  slug: "hello",
  title: "Hello",
  summary: "s",
  body: "# hi",
  durationMinutes: 5,
  isFreePreview: false,
};

async function setup() {
  const t = makeT();
  const admin = asAdmin(t);
  const courseId = await admin.mutation(api.admin.createCourse, course);
  return { t, admin, courseId };
}

describe("admin access", () => {
  it("rejects signed-out users and non-admins on every admin function", async () => {
    const { t, courseId } = await setup();
    const lessonId = await asAdmin(t).mutation(api.admin.createLesson, { courseId, ...lesson });
    for (const who of [t, asUser(t)]) {
      const reject = (p: Promise<unknown>) =>
        expect(p).rejects.toThrow(/UNAUTHENTICATED|FORBIDDEN/);
      await reject(who.query(api.admin.listCourses, {}));
      await reject(who.query(api.admin.getCourse, { courseId }));
      await reject(who.query(api.admin.getLesson, { lessonId }));
      await reject(who.mutation(api.admin.createCourse, course));
      await reject(who.mutation(api.admin.updateCourse, { courseId, ...course }));
      await reject(who.mutation(api.admin.deleteCourse, { courseId }));
      await reject(who.mutation(api.admin.createLesson, { courseId, ...lesson }));
      await reject(who.mutation(api.admin.updateLesson, { lessonId, ...lesson }));
      await reject(who.mutation(api.admin.deleteLesson, { lessonId }));
      await reject(who.mutation(api.admin.reorderLessons, { courseId, lessonIds: [lessonId] }));
      await reject(who.action(api.mux.createUpload, { lessonId }));
      await reject(who.action(api.mux.syncLessonVideo, { lessonId }));
      await reject(who.action(api.mux.removeVideo, { lessonId }));
    }
  });
});

describe("course CRUD", () => {
  it("creates with cleaned lists and auto order, lists with lesson counts", async () => {
    const { admin, courseId } = await setup();
    await admin.mutation(api.admin.createLesson, { courseId, ...lesson });
    const list = await admin.query(api.admin.listCourses, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: "intro-to-go", status: "draft", lessonCount: 1, order: 1 });
    expect(list[0].tags).toEqual(["go"]);
    expect(list[0].outcomes).toEqual(["Write Go"]);
  });

  it("validates slug format and uniqueness", async () => {
    const { admin, courseId } = await setup();
    await expect(admin.mutation(api.admin.createCourse, { ...course, slug: "Bad Slug" })).rejects.toThrow(
      "INVALID_SLUG",
    );
    await expect(admin.mutation(api.admin.createCourse, course)).rejects.toThrow("SLUG_TAKEN");
    const other = await admin.mutation(api.admin.createCourse, { ...course, slug: "other" });
    await expect(
      admin.mutation(api.admin.updateCourse, { courseId: other, ...course, slug: "intro-to-go" }),
    ).rejects.toThrow("SLUG_TAKEN");
    // keeping its own slug is fine
    await admin.mutation(api.admin.updateCourse, { courseId, ...course, title: "Renamed" });
    expect((await admin.query(api.admin.getCourse, { courseId }))?.course.title).toBe("Renamed");
  });

  it("updates every field and clears the cover image", async () => {
    const { admin, courseId } = await setup();
    await admin.mutation(api.admin.updateCourse, {
      courseId,
      ...course,
      tier: "pro",
      status: "published",
      level: "advanced",
      coverImageUrl: "https://x.test/a.png",
      order: 7,
    });
    let doc = (await admin.query(api.admin.getCourse, { courseId }))!.course;
    expect(doc).toMatchObject({ tier: "pro", status: "published", level: "advanced", order: 7 });
    expect(doc.coverImageUrl).toBe("https://x.test/a.png");
    await admin.mutation(api.admin.updateCourse, { courseId, ...course });
    doc = (await admin.query(api.admin.getCourse, { courseId }))!.course;
    expect(doc.coverImageUrl).toBeUndefined();
    expect(doc.order).toBe(7);
  });

  it("cascades delete to lessons, enrollments and progress", async () => {
    const { t, admin, courseId } = await setup();
    const lessonId = await admin.mutation(api.admin.createLesson, { courseId, ...lesson });
    const keep = await admin.mutation(api.admin.createCourse, { ...course, slug: "keep" });
    await t.run(async (ctx) => {
      await ctx.db.insert("enrollments", { userId: "u", courseId, enrolledAt: 1 });
      await ctx.db.insert("lessonProgress", { userId: "u", courseId, lessonId, completedAt: 1 });
      await ctx.db.insert("enrollments", { userId: "u", courseId: keep, enrolledAt: 1 });
    });
    const result = await admin.mutation(api.admin.deleteCourse, { courseId });
    expect(result).toEqual({ lessons: 1, enrollments: 1, progress: 1, chapters: 0, tests: 0, resources: 0 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("lessons").collect()).toHaveLength(0);
      expect(await ctx.db.query("lessonProgress").collect()).toHaveLength(0);
      expect(await ctx.db.query("enrollments").collect()).toHaveLength(1);
      expect(await ctx.db.get(courseId)).toBeNull();
    });
  });
});

describe("deleting a generated course", () => {
  it("also deletes its chapters, decks, tests, attempts and resources (with PDF blobs); other courses keep theirs", async () => {
    const { t, admin, courseId } = await setup();
    const keep = await admin.mutation(api.admin.createCourse, { ...course, slug: "keep" });
    const seeded = await t.run(async (ctx) => {
      const jobId = await ctx.db.insert("generationJobs", {
        createdBy: "admin_1", topic: "x", language: "en", level: "beginner", length: "short",
        status: "ready", courseId, createdAt: 0, updatedAt: 0,
      });
      const add = async (cid: Id<"courses">) => {
        const chapterId = await ctx.db.insert("chapters", { courseId: cid, slug: "chapter-1", title: "C", summary: "s", order: 1 });
        await ctx.db.insert("slideDecks", { courseId: cid, chapterId, slides: [], updatedAt: 0 });
        const testId = await ctx.db.insert("chapterTests", {
          courseId: cid, chapterId, version: 1, passPercent: 70, maxAttempts: 3, questions: [],
        });
        await ctx.db.insert("testAttempts", {
          userId: "u", courseId: cid, testId, testVersion: 1, answers: [], scorePercent: 100, passed: true, submittedAt: 1,
        });
        const storageId = await ctx.storage.store(new Blob(["%PDF"]));
        await ctx.db.insert("courseResources", {
          jobId, courseId: cid, kind: "pdf", title: "Sheet", storageId, origin: "admin", readStatus: "read",
        });
        await ctx.db.insert("courseResources", {
          jobId, courseId: cid, kind: "text", title: "Notes", text: "n", origin: "admin", readStatus: "read",
        });
        return storageId;
      };
      return { blob: await add(courseId), keptBlob: await add(keep) };
    });
    const result = await admin.mutation(api.admin.deleteCourse, { courseId });
    expect(result).toMatchObject({ chapters: 1, tests: 1, resources: 2 });
    await t.run(async (ctx) => {
      for (const table of ["chapters", "slideDecks", "chapterTests", "testAttempts"] as const) {
        const rows = await ctx.db.query(table).collect();
        expect(rows.map((r) => r.courseId)).toEqual([keep]);
      }
      const resources = await ctx.db.query("courseResources").collect();
      expect(resources.map((r) => r.courseId)).toEqual([keep, keep]);
      expect(await ctx.storage.get(seeded.blob)).toBeNull();
      expect(await ctx.storage.get(seeded.keptBlob)).not.toBeNull();
    });
  });
});

describe("lesson CRUD and reorder", () => {
  async function three() {
    const s = await setup();
    const ids: Id<"lessons">[] = [];
    for (const slug of ["a", "b", "c"]) {
      ids.push(await s.admin.mutation(api.admin.createLesson, { courseId: s.courseId, ...lesson, slug }));
    }
    return { ...s, ids };
  }

  it("appends lessons with order 1..n and enforces per-course unique slugs", async () => {
    const { admin, courseId, ids } = await three();
    const { lessons } = (await admin.query(api.admin.getCourse, { courseId }))!;
    expect(lessons.map((l) => [l.slug, l.order])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(lessons[0].body).toBe("# hi");
    await expect(admin.mutation(api.admin.createLesson, { courseId, ...lesson, slug: "a" })).rejects.toThrow(
      "SLUG_TAKEN",
    );
    await expect(
      admin.mutation(api.admin.createLesson, { courseId, ...lesson, slug: "Not Kebab" }),
    ).rejects.toThrow("INVALID_SLUG");
    await expect(
      admin.mutation(api.admin.createLesson, { courseId, ...lesson, slug: "d", durationMinutes: -1 }),
    ).rejects.toThrow("INVALID_DURATION");
    // same slug in another course is fine
    const other = await admin.mutation(api.admin.createCourse, { ...course, slug: "other" });
    await admin.mutation(api.admin.createLesson, { courseId: other, ...lesson, slug: "a" });
    await expect(
      admin.mutation(api.admin.updateLesson, { lessonId: ids[1], ...lesson, slug: "a" }),
    ).rejects.toThrow("SLUG_TAKEN");
  });

  it("updates a lesson including the free-preview flag", async () => {
    const { admin, ids } = await three();
    await admin.mutation(api.admin.updateLesson, {
      lessonId: ids[0],
      ...lesson,
      slug: "a",
      title: "New",
      isFreePreview: true,
      durationMinutes: 12,
    });
    const got = await admin.query(api.admin.getLesson, { lessonId: ids[0] });
    expect(got?.lesson).toMatchObject({ title: "New", isFreePreview: true, durationMinutes: 12 });
    expect(got?.course.slug).toBe("intro-to-go");
  });

  it("reorders and rejects an invalid set of ids", async () => {
    const { admin, courseId, ids } = await three();
    await admin.mutation(api.admin.reorderLessons, { courseId, lessonIds: [ids[2], ids[0], ids[1]] });
    const { lessons } = (await admin.query(api.admin.getCourse, { courseId }))!;
    expect(lessons.map((l) => l.slug)).toEqual(["c", "a", "b"]);
    await expect(
      admin.mutation(api.admin.reorderLessons, { courseId, lessonIds: [ids[0], ids[1]] }),
    ).rejects.toThrow("INVALID_REORDER");
    await expect(
      admin.mutation(api.admin.reorderLessons, { courseId, lessonIds: [ids[0], ids[0], ids[1]] }),
    ).rejects.toThrow("INVALID_REORDER");
  });

  it("deleting a lesson removes its progress and closes the order gap", async () => {
    const { t, admin, courseId, ids } = await three();
    await t.run(async (ctx) => {
      await ctx.db.insert("lessonProgress", { userId: "u", courseId, lessonId: ids[0], completedAt: 1 });
    });
    await admin.mutation(api.admin.deleteLesson, { lessonId: ids[0] });
    const { lessons } = (await admin.query(api.admin.getCourse, { courseId }))!;
    expect(lessons.map((l) => [l.slug, l.order])).toEqual([["b", 1], ["c", 2]]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("lessonProgress").collect()).toHaveLength(0);
    });
  });
});

describe("mux events and helpers", () => {
  it("maps webhook events", () => {
    expect(mapMuxEvent({ type: "video.upload.asset_created", data: { id: "u1", asset_id: "a1" } })).toEqual({
      match: { uploadId: "u1" },
      patch: { muxAssetId: "a1", videoStatus: "processing" },
    });
    expect(
      mapMuxEvent({ type: "video.asset.ready", data: { id: "a1", playback_ids: [{ id: "p1" }] } })?.patch,
    ).toEqual({ videoStatus: "ready", muxPlaybackId: "p1" });
    expect(mapMuxEvent({ type: "video.asset.errored", data: { id: "a1" } })?.patch).toEqual({
      videoStatus: "errored",
    });
    expect(mapMuxEvent({ type: "video.asset.created", data: { id: "a1" } })).toBeNull();
  });

  it("maps polled state", () => {
    expect(patchFromPolled({ status: "waiting" }, null, undefined)).toBeNull();
    expect(patchFromPolled({ status: "asset_created", asset_id: "a" }, null, undefined)).toEqual({
      muxAssetId: "a",
      videoStatus: "processing",
    });
    expect(patchFromPolled(null, { status: "ready", playback_ids: [{ id: "p" }] }, "a")).toEqual({
      muxAssetId: "a",
      muxPlaybackId: "p",
      videoStatus: "ready",
    });
    expect(patchFromPolled({ status: "timed_out" }, null, undefined)).toEqual({ videoStatus: "errored" });
  });

  it("verifies signatures", async () => {
    const body = '{"type":"x"}';
    const t = 1_700_000_000;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s3cret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
    const sig = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
    const header = `t=${t},v1=${sig}`;
    expect(await verifyMuxSignature(body, header, "s3cret", t)).toBe(true);
    expect(await verifyMuxSignature(body, header, "wrong", t)).toBe(false);
    expect(await verifyMuxSignature(body + " ", header, "s3cret", t)).toBe(false);
    expect(await verifyMuxSignature(body, header, "s3cret", t + 1000)).toBe(false);
    expect(await verifyMuxSignature(body, null, "s3cret", t)).toBe(false);
  });

  it("applies events by upload id then asset id, and the webhook route is registered", async () => {
    const { t, admin, courseId } = await setup();
    const lessonId = await admin.mutation(api.admin.createLesson, { courseId, ...lesson });
    await t.mutation(internal.muxData.setVideo, { lessonId, muxUploadId: "u1", videoStatus: "waiting" });
    expect(await t.mutation(internal.muxData.applyEvent, { uploadId: "u1", muxAssetId: "a1", videoStatus: "processing" })).toBe(true);
    expect(await t.mutation(internal.muxData.applyEvent, { assetId: "a1", uploadId: "u1", muxPlaybackId: "p1", videoStatus: "ready" })).toBe(true);
    expect(await t.mutation(internal.muxData.applyEvent, { assetId: "zzz", videoStatus: "ready" })).toBe(false);
    const doc = (await admin.query(api.admin.getLesson, { lessonId }))!.lesson;
    expect(doc).toMatchObject({ muxAssetId: "a1", muxPlaybackId: "p1", videoStatus: "ready", muxUploadId: "u1" });

    process.env.MUX_WEBHOOK_ALLOW_UNSIGNED = "1";
    let res: Response;
    try {
      res = await t.fetch("/mux/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "video.asset.errored", data: { id: "a1" } }),
      });
    } finally {
      delete process.env.MUX_WEBHOOK_ALLOW_UNSIGNED;
    }
    expect(res.status).toBe(200);
    expect((await admin.query(api.admin.getLesson, { lessonId }))!.lesson.videoStatus).toBe("errored");
  });

  describe("webhook route security", () => {
    const event = JSON.stringify({ type: "video.asset.ready", data: { id: "a1", playback_ids: [{ id: "evil" }] } });
    async function sign(body: string, secret: string, t: number) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
      return `t=${t},v1=${Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    }
    async function seeded() {
      const { t, admin, courseId } = await setup();
      const lessonId = await admin.mutation(api.admin.createLesson, { courseId, ...lesson });
      await t.mutation(internal.muxData.setVideo, { lessonId, muxAssetId: "a1", videoStatus: "processing" });
      return { t, admin, lessonId };
    }
    const unset = () => {
      delete process.env.MUX_WEBHOOK_SECRET;
      delete process.env.MUX_WEBHOOK_ALLOW_UNSIGNED;
    };

    it("returns 503 and changes nothing when no secret is configured", async () => {
      unset();
      const { t, admin, lessonId } = await seeded();
      const res = await t.fetch("/mux/webhook", { method: "POST", body: event });
      expect(res.status).toBe(503);
      expect((await admin.query(api.admin.getLesson, { lessonId }))!.lesson.videoStatus).toBe("processing");
    });

    it("accepts unsigned events only with the explicit dev flag", async () => {
      unset();
      process.env.MUX_WEBHOOK_ALLOW_UNSIGNED = "1";
      try {
        const { t } = await seeded();
        expect((await t.fetch("/mux/webhook", { method: "POST", body: event })).status).toBe(200);
      } finally {
        unset();
      }
    });

    it("rejects bad and stale signatures with 401 and accepts a valid one", async () => {
      process.env.MUX_WEBHOOK_SECRET = "s3cret";
      try {
        const { t, admin, lessonId } = await seeded();
        const now = Math.floor(Date.now() / 1000);
        for (const header of [
          null,
          await sign(event, "wrong", now),
          await sign(event, "s3cret", now - 3600),
        ]) {
          const res = await t.fetch("/mux/webhook", {
            method: "POST",
            body: event,
            headers: header ? { "mux-signature": header } : {},
          });
          expect(res.status).toBe(401);
        }
        expect((await admin.query(api.admin.getLesson, { lessonId }))!.lesson.videoStatus).toBe("processing");
        const ok = await t.fetch("/mux/webhook", {
          method: "POST",
          body: event,
          headers: { "mux-signature": await sign(event, "s3cret", now) },
        });
        expect(ok.status).toBe(200);
        expect((await admin.query(api.admin.getLesson, { lessonId }))!.lesson.videoStatus).toBe("ready");
      } finally {
        unset();
      }
    });
  });

  it("kebab-case check", () => {
    expect(isKebabCase("a-b-1")).toBe(true);
    for (const bad of ["", "A", "a_b", "a--b", "-a", "a-", "a b"]) expect(isKebabCase(bad)).toBe(false);
  });
});

describe("content editing", () => {
  const q = (id: string, correct = [0]) => ({
    id,
    kind: "single" as const,
    prompt: `Prompt ${id}`,
    options: ["A", "B"],
    correct,
    explanation: "Because.",
  });
  const slide = (n: number) => ({
    layout: "bullets" as const,
    title: `Slide ${n}`,
    bullets: ["one"],
    notes: "notes",
  });
  const slides = (n: number) => Array.from({ length: n }, (_, i) => slide(i + 1));

  async function seed() {
    const { t, admin, courseId } = await setup();
    const chapterId = await t.run(async (ctx) => {
      const chapterId = await ctx.db.insert("chapters", {
        courseId,
        slug: "chapter-1",
        title: "Chapter 1",
        summary: "s",
        order: 1,
      });
      await ctx.db.insert("lessons", { courseId, chapterId, order: 1, ...lesson });
      await ctx.db.insert("slideDecks", { courseId, chapterId, slides: slides(6), updatedAt: 1 });
      await ctx.db.insert("chapterTests", {
        courseId,
        chapterId,
        version: 1,
        passPercent: 70,
        maxAttempts: 3,
        questions: [q("a"), q("b")],
      });
      return chapterId;
    });
    return { t, admin, courseId, chapterId };
  }
  const rows = (t: ReturnType<typeof makeT>) =>
    t.run(async (ctx) => ({
      tests: await ctx.db.query("chapterTests").collect(),
      decks: await ctx.db.query("slideDecks").collect(),
    }));

  it("rejects non-admins on every editing function", async () => {
    const { t, courseId, chapterId } = await seed();
    for (const who of [t, asUser(t)]) {
      const reject = (p: Promise<unknown>) =>
        expect(p).rejects.toThrow(/UNAUTHENTICATED|FORBIDDEN/);
      await reject(who.query(api.admin.listChapters, { courseId }));
      await reject(who.query(api.admin.getDeck, { chapterId }));
      await reject(who.query(api.admin.getTest, { chapterId }));
      await reject(who.mutation(api.admin.updateChapter, { chapterId, title: "x" }));
      await reject(who.mutation(api.admin.updateDeck, { chapterId, slides: slides(6) }));
      await reject(who.mutation(api.admin.updateTest, { chapterId, passPercent: 80 }));
    }
  });

  it("lists chapters in order with lessons, deck flag and test summary", async () => {
    const { t, admin, courseId } = await seed();
    await t.run((ctx) =>
      ctx.db.insert("chapters", { courseId, slug: "chapter-0", title: "Zero", summary: "", order: 0 }),
    );
    const list = await admin.query(api.admin.listChapters, { courseId });
    expect(list.map((c) => c.title)).toEqual(["Zero", "Chapter 1"]);
    expect(list[0]).toMatchObject({ hasDeck: false, test: null, lessons: [] });
    expect(list[1].hasDeck).toBe(true);
    expect(list[1].lessons).toMatchObject([{ title: "Hello" }]);
    expect(list[1].test).toMatchObject({ version: 1, questionCount: 2, passPercent: 70, maxAttempts: 3 });
  });

  it("updates chapter title and summary, rejecting empty titles", async () => {
    const { admin, courseId, chapterId } = await seed();
    await admin.mutation(api.admin.updateChapter, { chapterId, title: " New ", summary: "Sum" });
    const [c] = await admin.query(api.admin.listChapters, { courseId });
    expect(c).toMatchObject({ title: "New", summary: "Sum" });
    await expect(admin.mutation(api.admin.updateChapter, { chapterId, title: " " })).rejects.toThrow("INVALID");
  });

  it("updateTest bumps the version only when questions change, on the one row", async () => {
    const { t, admin, chapterId } = await seed();
    await admin.mutation(api.admin.updateTest, { chapterId, passPercent: 80, maxAttempts: 5 });
    let test = await admin.query(api.admin.getTest, { chapterId });
    expect(test).toMatchObject({ version: 1, passPercent: 80, maxAttempts: 5 });
    // identical questions: no bump
    await admin.mutation(api.admin.updateTest, { chapterId, questions: [q("a"), q("b")] });
    expect((await admin.query(api.admin.getTest, { chapterId }))?.version).toBe(1);
    await admin.mutation(api.admin.updateTest, { chapterId, questions: [q("a"), q("b", [1])] });
    test = await admin.query(api.admin.getTest, { chapterId });
    expect(test?.version).toBe(2);
    expect(test?.questions[1].correct).toEqual([1]);
    expect((await rows(t)).tests).toHaveLength(1);
  });

  it("updateTest rejects invalid questions and settings", async () => {
    const { admin, chapterId } = await seed();
    const bad = (questions: unknown[]) =>
      expect(admin.mutation(api.admin.updateTest, { chapterId, questions: questions as never })).rejects.toThrow("INVALID");
    await bad([{ ...q("a"), correct: [5] }]);
    await bad([{ ...q("a"), correct: [0, 1] }]);
    await bad([{ ...q("a"), prompt: "  " }]);
    await bad([{ ...q("a"), options: ["A", ""] }]);
    await bad([{ ...q("a"), explanation: "" }]);
    await bad([q("a"), q("a")]);
    await bad([]);
    for (const patch of [{ passPercent: 0 }, { passPercent: 101 }, { maxAttempts: 0 }, { maxAttempts: 21 }, { maxAttempts: 1.5 }]) {
      await expect(admin.mutation(api.admin.updateTest, { chapterId, ...patch })).rejects.toThrow("INVALID");
    }
    expect((await admin.query(api.admin.getTest, { chapterId }))?.version).toBe(1);
  });

  it("getTest and getDeck return full data including correct answers", async () => {
    const { admin, chapterId } = await seed();
    const test = await admin.query(api.admin.getTest, { chapterId });
    expect(test?.questions[0]).toMatchObject({ correct: [0], explanation: "Because." });
    const deck = await admin.query(api.admin.getDeck, { chapterId });
    expect(deck?.slides).toHaveLength(6);
  });

  it("updateDeck patches the one row and enforces 6-20 slides", async () => {
    const { t, admin, chapterId } = await seed();
    await admin.mutation(api.admin.updateDeck, { chapterId, slides: slides(20) });
    expect((await rows(t)).decks).toHaveLength(1);
    expect((await admin.query(api.admin.getDeck, { chapterId }))?.slides).toHaveLength(20);
    for (const n of [5, 21]) {
      await expect(admin.mutation(api.admin.updateDeck, { chapterId, slides: slides(n) })).rejects.toThrow("INVALID");
    }
    await expect(
      admin.mutation(api.admin.updateDeck, { chapterId, slides: [{ ...slide(1), bullets: [] }, ...slides(5)] }),
    ).rejects.toThrow("INVALID");
  });

  it("updateCourse accepts language", async () => {
    const { admin, courseId } = await setup();
    await admin.mutation(api.admin.updateCourse, { courseId, ...course, language: "he" });
    expect((await admin.query(api.admin.getCourse, { courseId }))?.course.language).toBe("he");
  });
});
