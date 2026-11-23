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
const asUser = (t: T) => t.withIdentity({ subject: "user_1", issuer, name: "Ada" });
const asAdmin = (t: T) => t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });

async function seed(
  t: T,
  opts: { tier?: "free" | "pro"; status: "draft" | "published"; withCourse?: boolean },
) {
  return await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      slug: "c", title: "C", summary: "s", description: "d", level: "beginner",
      tier: opts.tier ?? "free", status: opts.status, tags: [], outcomes: [], order: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      createdBy: "admin_1", topic: "x", language: "en", level: "beginner", length: "short",
      status: "ready", createdAt: 0, updatedAt: 0,
    });
    const cid = opts.withCourse === false ? undefined : courseId;
    const link = await ctx.db.insert("courseResources", {
      jobId, courseId: cid, kind: "url", title: "Docs", url: "https://example.com/docs",
      origin: "admin", readStatus: "read",
    });
    const storageId = await ctx.storage.store(new Blob(["pdf"]));
    const pdf = await ctx.db.insert("courseResources", {
      jobId, courseId: cid, kind: "pdf", title: "Sheet", storageId,
      origin: "admin", readStatus: "read",
    });
    const text = await ctx.db.insert("courseResources", {
      jobId, courseId: cid, kind: "text", title: "Notes", text: "secret notes",
      origin: "admin", readStatus: "read",
    });
    return { link, pdf, text };
  });
}

describe("resources.getForViewer", () => {
  it("returns null for a learner when the course is a draft", async () => {
    const t = makeT();
    const { link } = await seed(t, { status: "draft" });
    expect(await asUser(t).query(api.resources.getForViewer, { resourceId: link })).toBeNull();
  });

  it("returns the resource to an admin on a draft course", async () => {
    const t = makeT();
    const { link } = await seed(t, { status: "draft" });
    expect(await asAdmin(t).query(api.resources.getForViewer, { resourceId: link })).toEqual({
      title: "Docs", kind: "url", url: "https://example.com/docs",
    });
  });

  it("resolves url and pdf for a signed-in learner on a published free course", async () => {
    const t = makeT();
    const { link, pdf } = await seed(t, { status: "published" });
    expect(await asUser(t).query(api.resources.getForViewer, { resourceId: link })).toMatchObject({
      kind: "url", url: "https://example.com/docs",
    });
    const res = await asUser(t).query(api.resources.getForViewer, { resourceId: pdf });
    expect(res?.kind).toBe("pdf");
    expect(res?.url).toEqual(expect.stringContaining("http"));
  });

  it("is locked for anonymous viewers and non-Pro learners on a pro course", async () => {
    const t = makeT();
    const { link } = await seed(t, { status: "published", tier: "pro" });
    expect(await t.query(api.resources.getForViewer, { resourceId: link })).toBeNull();
    expect(await asUser(t).query(api.resources.getForViewer, { resourceId: link })).toBeNull();
  });

  it("returns null for a resource without a course (non-admins) and for text resources", async () => {
    const t = makeT();
    const orphan = await seed(t, { status: "published", withCourse: false });
    expect(await asUser(t).query(api.resources.getForViewer, { resourceId: orphan.link })).toBeNull();
    expect(await asAdmin(t).query(api.resources.getForViewer, { resourceId: orphan.link })).not.toBeNull();
    const t2 = makeT();
    const { text } = await seed(t2, { status: "published" });
    expect(await asUser(t2).query(api.resources.getForViewer, { resourceId: text })).toBeNull();
  });

  it("returns null for a malformed id", async () => {
    const t = makeT();
    expect(await asUser(t).query(api.resources.getForViewer, { resourceId: "nonsense" })).toBeNull();
  });
});
