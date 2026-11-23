/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;
const asUser = (t: T) => t.withIdentity({ subject: "user_1", issuer });
const asAdmin = (t: T) => t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });

const jobArgs = { topic: "Intro to RAG", language: "en", level: "beginner", length: "short" } as const;
const sub = (n: string) => ({ title: n, goal: `goal ${n}` });
const outline3x2 = {
  chapters: [1, 2, 3].map((c) => ({
    title: `Ch ${c}`,
    goal: `g${c}`,
    subchapters: [sub(`S${c}.1`), sub(`S${c}.2`)],
  })),
};

async function setStatus(t: T, jobId: Id<"generationJobs">, status: string, extra: object = {}) {
  await t.run(async (ctx) => {
    await ctx.db.patch(jobId, { status: status as never, ...extra });
  });
}
async function outlineReady(t: T, topic = "Intro to RAG", outline = outline3x2) {
  const jobId = await asAdmin(t).mutation(api.generation.createJob, { ...jobArgs, topic });
  await setStatus(t, jobId, "outline_ready", { outline });
  return jobId;
}
const courses = (t: T) => t.run((ctx) => ctx.db.query("courses").collect());

describe("generation access", () => {
  it("non-admin gets FORBIDDEN", async () => {
    const t = makeT();
    await expect(asUser(t).mutation(api.generation.createJob, jobArgs)).rejects.toThrow("FORBIDDEN");
    await expect(asUser(t).query(api.generation.list, {})).rejects.toThrow("FORBIDDEN");
    await expect(t.mutation(api.generation.createJob, jobArgs)).rejects.toThrow("UNAUTHENTICATED");
  });
});

describe("startJob", () => {
  it("transitions once, second call BAD_STATE, logs one event", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await a.mutation(api.generation.createJob, jobArgs);
    await a.mutation(api.generation.startJob, { jobId });
    await expect(a.mutation(api.generation.startJob, { jobId })).rejects.toThrow("BAD_STATE");
    const job = await a.query(api.generation.get, { jobId });
    expect(job?.status).toBe("researching");
    const events = await a.query(api.generation.events, { jobId });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("info");
  });
});

describe("requestRegenerate", () => {
  async function readyJob(t: T, courseStatus: "draft" | "published") {
    const jobId = await outlineReady(t);
    const courseId = await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
    await setStatus(t, jobId, "ready");
    await t.run((ctx) => ctx.db.patch(courseId, { status: courseStatus }));
    return jobId;
  }
  it("draft ready job goes to writing; second call BAD_STATE", async () => {
    const t = makeT();
    const jobId = await readyJob(t, "draft");
    await asAdmin(t).mutation(api.generation.requestRegenerate, { jobId });
    expect((await asAdmin(t).query(api.generation.get, { jobId }))?.status).toBe("writing");
    await expect(asAdmin(t).mutation(api.generation.requestRegenerate, { jobId })).rejects.toThrow("BAD_STATE");
  });
  it("published course is BAD_STATE and job stays ready", async () => {
    const t = makeT();
    const jobId = await readyJob(t, "published");
    await expect(asAdmin(t).mutation(api.generation.requestRegenerate, { jobId })).rejects.toThrow("BAD_STATE");
    expect((await asAdmin(t).query(api.generation.get, { jobId }))?.status).toBe("ready");
  });
});

describe("approveOutline", () => {
  it("twice: second BAD_STATE, one course", async () => {
    const t = makeT();
    const jobId = await outlineReady(t);
    const a = asAdmin(t);
    await a.mutation(api.generation.approveOutline, { jobId });
    await expect(a.mutation(api.generation.approveOutline, { jobId })).rejects.toThrow("BAD_STATE");
    expect(await courses(t)).toHaveLength(1);
  });

  it("builds draft course, chapters, global-order lessons, attaches resources", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await outlineReady(t);
    const rid = await a.mutation(api.generation.addResource, { jobId, kind: "text", text: "notes", title: "N" }).catch(async () => {
      // addResource requires queued; insert directly for this case
      return await t.run((ctx) =>
        ctx.db.insert("courseResources", { jobId, kind: "text", title: "N", text: "notes", origin: "admin", readStatus: "pending" }),
      );
    });
    const courseId = await a.mutation(api.generation.approveOutline, { jobId });
    const data = await t.run(async (ctx) => ({
      course: await ctx.db.get(courseId),
      chapters: await ctx.db.query("chapters").collect(),
      lessons: await ctx.db.query("lessons").withIndex("by_course_order", (q) => q.eq("courseId", courseId)).collect(),
      res: await ctx.db.get(rid),
      job: await ctx.db.get(jobId),
    }));
    expect(data.course).toMatchObject({ status: "draft", tier: "free", language: "en", slug: "intro-to-rag", generationJobId: jobId });
    expect(data.chapters.map((c) => c.slug).sort()).toEqual(["chapter-1", "chapter-2", "chapter-3"]);
    expect(data.lessons.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(data.lessons.map((l) => l.slug)).toEqual([
      "lesson-1-1", "lesson-1-2", "lesson-2-1", "lesson-2-2", "lesson-3-1", "lesson-3-2",
    ]);
    expect(data.lessons[0]).toMatchObject({ body: "", isFreePreview: false, durationMinutes: 0 });
    expect(data.lessons.every((l) => l.chapterId)).toBe(true);
    expect(data.res?.courseId).toBe(courseId);
    expect(data.job).toMatchObject({ status: "writing", courseId });
    expect(data.job?.outline).toEqual(outline3x2);
  });

  it("Hebrew-only title gets course-xxxxxx slug", async () => {
    const t = makeT();
    const jobId = await outlineReady(t, "מבוא לבינה");
    const courseId = await asAdmin(t).mutation(api.generation.approveOutline, { jobId });
    const c = await t.run((ctx) => ctx.db.get(courseId));
    expect(c?.slug).toMatch(/^course-[0-9a-f]{6}$/);
  });
});

describe("outline", () => {
  it("updateOutline rejects 11 chapters, 6 subchapters, empty; only in outline_ready", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await outlineReady(t);
    const ch = (n: number) => ({ title: "c", goal: "g", subchapters: Array.from({ length: n }, (_, i) => sub(`s${i}`)) });
    await expect(a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: Array.from({ length: 11 }, () => ch(1)) } })).rejects.toThrow("INVALID_OUTLINE");
    await expect(a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: [ch(6)] } })).rejects.toThrow("INVALID_OUTLINE");
    await expect(a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: [] } })).rejects.toThrow("INVALID_OUTLINE");
    await expect(a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: [ch(0)] } })).rejects.toThrow("INVALID_OUTLINE");
    await a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: [ch(2)] } });
    await setStatus(t, jobId, "writing");
    await expect(a.mutation(api.generation.updateOutline, { jobId, outline: { chapters: [ch(2)] } })).rejects.toThrow("BAD_STATE");
  });
});

describe("resources", () => {
  const pdf = async (t: T, size: number, type = "application/pdf") =>
    await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(size)], { type })));

  it("rejects PDF over 20 MB, accepts small PDF, rejects non-pdf type", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await a.mutation(api.generation.createJob, jobArgs);
    await expect(a.mutation(api.generation.addResource, { jobId, kind: "pdf", storageId: await pdf(t, 20 * 1024 * 1024 + 1) })).rejects.toThrow("PDF_TOO_LARGE");
    await expect(a.mutation(api.generation.addResource, { jobId, kind: "pdf", storageId: await pdf(t, 10, "text/plain") })).rejects.toThrow("INVALID_RESOURCE");
    const id = await a.mutation(api.generation.addResource, { jobId, kind: "pdf", storageId: await pdf(t, 100), title: "Doc" });
    expect(id).toBeTruthy();
  });

  it("validates urls and youtube ids", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await a.mutation(api.generation.createJob, jobArgs);
    await expect(a.mutation(api.generation.addResource, { jobId, kind: "url", url: "javascript:alert(1)" })).rejects.toThrow("INVALID_RESOURCE");
    await expect(a.mutation(api.generation.addResource, { jobId, kind: "youtube", url: "https://youtube.com/watch?v=bad" })).rejects.toThrow("INVALID_RESOURCE");
    await a.mutation(api.generation.addResource, { jobId, kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
    await a.mutation(api.generation.addResource, { jobId, kind: "url", url: "https://example.com/a" });
  });

  it("addResource and removeResource after queued -> BAD_STATE", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await a.mutation(api.generation.createJob, jobArgs);
    const rid = await a.mutation(api.generation.addResource, { jobId, kind: "text", text: "x" });
    await a.mutation(api.generation.startJob, { jobId });
    await expect(a.mutation(api.generation.addResource, { jobId, kind: "text", text: "y" })).rejects.toThrow("BAD_STATE");
    await expect(a.mutation(api.generation.removeResource, { resourceId: rid })).rejects.toThrow("BAD_STATE");
  });
});

describe("dispatch markers and events", () => {
  it("markDispatched/markDispatchError set fields; events latest 200 ascending", async () => {
    const t = makeT();
    const a = asAdmin(t);
    const jobId = await a.mutation(api.generation.createJob, jobArgs);
    await a.mutation(api.generation.markDispatched, { jobId, eveSessionId: "s1" });
    await a.mutation(api.generation.markDispatchError, { jobId, error: "boom" });
    const job = await a.query(api.generation.get, { jobId });
    expect(job).toMatchObject({ eveSessionId: "s1", dispatchError: "boom" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++)
        await ctx.db.insert("generationEvents", { jobId, at: i + 1, kind: "info", message: `m${i}` });
    });
    const ev = await a.query(api.generation.events, { jobId });
    expect(ev).toHaveLength(200);
    expect(ev[0].message).toBe("m51");
    expect(ev[198].message).toBe("m249");
    expect(ev[199].kind).toBe("error"); // the dispatch-error event is the newest
  });
});
