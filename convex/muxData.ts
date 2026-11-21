import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { videoStatusValidator } from "./schema";

/**
 * Non-Node half of the Mux integration: pure helpers (event mapping, signature check) and the
 * internal queries/mutations used by `mux.ts` (Node actions) and `http.ts` (webhook).
 */

type VideoStatus = NonNullable<Doc<"lessons">["videoStatus"]>;

export type VideoPatch = {
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  videoStatus?: VideoStatus;
};

export type MuxEventMatch = { uploadId?: string; assetId?: string };

export type MuxEventResult = { match: MuxEventMatch; patch: VideoPatch } | null;

type MuxEvent = { type?: string; data?: Record<string, unknown> };

/** Maps a Mux webhook event to the lesson lookup keys and the fields to patch. `null` = ignore. */
export function mapMuxEvent(event: MuxEvent): MuxEventResult {
  const data = event.data ?? {};
  const id = typeof data.id === "string" ? data.id : undefined;
  switch (event.type) {
    case "video.upload.asset_created": {
      const assetId = typeof data.asset_id === "string" ? data.asset_id : undefined;
      if (!id || !assetId) return null;
      return {
        match: { uploadId: id },
        patch: { muxAssetId: assetId, videoStatus: "processing" },
      };
    }
    case "video.upload.errored":
    case "video.upload.cancelled":
      if (!id) return null;
      return { match: { uploadId: id }, patch: { videoStatus: "errored" } };
    case "video.asset.ready": {
      if (!id) return null;
      return {
        match: { assetId: id, uploadId: stringOrUndefined(data.upload_id) },
        patch: { videoStatus: "ready", muxPlaybackId: firstPlaybackId(data.playback_ids) },
      };
    }
    case "video.asset.errored":
      if (!id) return null;
      return {
        match: { assetId: id, uploadId: stringOrUndefined(data.upload_id) },
        patch: { videoStatus: "errored" },
      };
    default:
      return null;
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function firstPlaybackId(playbackIds: unknown): string | undefined {
  if (!Array.isArray(playbackIds)) return undefined;
  for (const entry of playbackIds) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/** Maps a polled Mux upload + asset to a lesson patch (used by `syncLessonVideo`). */
export function patchFromPolled(
  upload: { status?: string; asset_id?: string } | null,
  asset: { status?: string; playback_ids?: unknown } | null,
  assetId: string | undefined,
): VideoPatch | null {
  if (asset && assetId) {
    if (asset.status === "ready") {
      return {
        muxAssetId: assetId,
        muxPlaybackId: firstPlaybackId(asset.playback_ids),
        videoStatus: "ready",
      };
    }
    if (asset.status === "errored") return { muxAssetId: assetId, videoStatus: "errored" };
    return { muxAssetId: assetId, videoStatus: "processing" };
  }
  if (upload?.asset_id) return { muxAssetId: upload.asset_id, videoStatus: "processing" };
  if (upload && ["errored", "cancelled", "timed_out"].includes(upload.status ?? "")) {
    return { videoStatus: "errored" };
  }
  return null;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies a `mux-signature` header (`t=<unix seconds>,v1=<hex hmac-sha256 of "t.body">`).
 * Rejects timestamps older than `toleranceSeconds` (replay protection).
 */
export async function verifyMuxSignature(
  body: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return timingSafeEqual(hex(mac), signature);
}

export const getLesson = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => await ctx.db.get(lessonId),
});

/** Overwrites the lesson's video fields. A field passed as `undefined` is cleared. */
export const setVideo = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    videoStatus: v.optional(videoStatusValidator),
  },
  handler: async (ctx, { lessonId, ...fields }) => {
    await ctx.db.patch(lessonId, fields);
  },
});

/** Merges a patch into the lesson (only the provided fields change). */
export const mergeVideo = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    videoStatus: v.optional(videoStatusValidator),
  },
  handler: async (ctx, { lessonId, ...fields }) => {
    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    await ctx.db.patch(lessonId, patch);
  },
});

/** Applies a mapped webhook event. Matches by asset id first, then upload id. Returns true if a lesson changed. */
export const applyEvent = internalMutation({
  args: {
    uploadId: v.optional(v.string()),
    assetId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    videoStatus: v.optional(videoStatusValidator),
  },
  handler: async (ctx, { uploadId, assetId, ...fields }) => {
    const lesson =
      (assetId
        ? await ctx.db
            .query("lessons")
            .withIndex("by_muxAssetId", (q) => q.eq("muxAssetId", assetId))
            .first()
        : null) ??
      (uploadId
        ? await ctx.db
            .query("lessons")
            .withIndex("by_muxUploadId", (q) => q.eq("muxUploadId", uploadId))
            .first()
        : null);
    if (!lesson) return false;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    await ctx.db.patch(lesson._id, patch);
    return true;
  },
});
