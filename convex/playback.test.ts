/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";

type T = ReturnType<typeof makeT>;
function makeT() {
  return convexTest(schema, modules);
}
const asAdmin = (t: T) => t.withIdentity({ subject: "admin_1", issuer, metadata: { role: "admin" } });

const course = {
  slug: "c",
  title: "C",
  summary: "s",
  description: "d",
  level: "beginner" as const,
  tier: "pro" as const,
  status: "published" as const,
  tags: [],
  outcomes: [],
};

async function setup(opts: {
  tier?: "free" | "pro";
  status?: "draft" | "published";
  isFreePreview?: boolean;
  videoStatus?: "processing" | "ready";
}) {
  const t = makeT();
  const admin = asAdmin(t);
  const courseId = await admin.mutation(api.admin.createCourse, {
    ...course,
    tier: opts.tier ?? "pro",
    status: opts.status ?? "published",
  });
  const lessonId = await admin.mutation(api.admin.createLesson, {
    courseId,
    slug: "l",
    title: "L",
    summary: "s",
    body: "# hi",
    durationMinutes: 5,
    isFreePreview: opts.isFreePreview ?? false,
  });
  await t.mutation(internal.muxData.setVideo, {
    lessonId,
    muxAssetId: "a1",
    muxPlaybackId: "pb1",
    videoStatus: opts.videoStatus ?? "ready",
  });
  return { t, lessonId };
}

/** What `playback.getLessonTokens` passes after reading the caller's identity. */
async function resolve(
  t: T,
  lessonId: Id<"lessons">,
  who: { subject?: string; admin?: boolean; proClaim?: boolean },
) {
  return await t.query(internal.playbackData.resolveLessonPlayback, {
    lessonId,
    subject: who.subject,
    admin: who.admin ?? false,
    proClaim: who.proClaim ?? false,
  });
}

describe("playback access decision", () => {
  it("gives no playback ID for a locked Pro lesson to signed-out and free users", async () => {
    const { t, lessonId } = await setup({});
    expect(await resolve(t, lessonId, {})).toBeNull();
    expect(await resolve(t, lessonId, { subject: "user_1" })).toBeNull();
  });

  it("allows Pro members (claim or users.plan) on a Pro lesson", async () => {
    const { t, lessonId } = await setup({});
    expect(await resolve(t, lessonId, { subject: "user_2", proClaim: true })).toBe("pb1");
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_3", name: "Pro User", plan: "pro" } as never);
    });
    expect(await resolve(t, lessonId, { subject: "user_3" })).toBe("pb1");
  });

  it("allows a free preview signed out, and flips with isFreePreview", async () => {
    const { t, lessonId } = await setup({ isFreePreview: true });
    expect(await resolve(t, lessonId, {})).toBe("pb1");
    await t.run(async (ctx) => ctx.db.patch(lessonId, { isFreePreview: false }));
    expect(await resolve(t, lessonId, {})).toBeNull();
  });

  it("requires sign-in for a non-preview lesson in a free course", async () => {
    const { t, lessonId } = await setup({ tier: "free" });
    expect(await resolve(t, lessonId, {})).toBeNull();
    expect(await resolve(t, lessonId, { subject: "user_1" })).toBe("pb1");
  });

  it("lets admins in, including draft courses; others never see drafts", async () => {
    const { t, lessonId } = await setup({ status: "draft", isFreePreview: true });
    expect(await resolve(t, lessonId, { subject: "admin_1", admin: true })).toBe("pb1");
    expect(await resolve(t, lessonId, {})).toBeNull();
    expect(await resolve(t, lessonId, { subject: "user_2", proClaim: true })).toBeNull();
  });

  it("returns null while the video is not ready, even for admins", async () => {
    const { t, lessonId } = await setup({ videoStatus: "processing" });
    expect(await resolve(t, lessonId, { subject: "admin_1", admin: true })).toBeNull();
  });
});
