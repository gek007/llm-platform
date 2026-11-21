"use node";

import Mux from "@mux/mux-node";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { patchFromPolled } from "./muxData";

function mux() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) throw new ConvexError("MUX_NOT_CONFIGURED");
  return new Mux({ tokenId, tokenSecret });
}

function isNotFound(error: unknown) {
  return (error as { status?: number } | null)?.status === 404;
}

async function deleteAsset(client: Mux, assetId: string | undefined) {
  if (!assetId) return;
  try {
    await client.video.assets.delete(assetId);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** Creates a Mux direct upload for the lesson and returns the URL the uploader PUTs to. */
export const createUpload = action({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }): Promise<{ url: string; uploadId: string }> => {
    await requireAdmin(ctx);
    const lesson = await ctx.runQuery(internal.muxData.getLesson, { lessonId });
    if (!lesson) throw new ConvexError("NOT_FOUND");
    const client = mux();
    // Replacing a video: drop the previous asset so it doesn't linger on Mux.
    await deleteAsset(client, lesson.muxAssetId);
    const upload = await client.video.uploads.create({
      cors_origin: process.env.MUX_CORS_ORIGIN ?? "*",
      new_asset_settings: { playback_policies: ["signed"] },
    });
    if (!upload.url) throw new ConvexError("MUX_UPLOAD_FAILED");
    await ctx.runMutation(internal.muxData.setVideo, {
      lessonId,
      muxUploadId: upload.id,
      videoStatus: "waiting",
    });
    return { url: upload.url, uploadId: upload.id };
  },
});

/** Polls Mux for the lesson's upload/asset and updates the lesson. Returns the new status. */
export const syncLessonVideo = action({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }): Promise<string | null> => {
    await requireAdmin(ctx);
    const lesson = await ctx.runQuery(internal.muxData.getLesson, { lessonId });
    if (!lesson) throw new ConvexError("NOT_FOUND");
    if (!lesson.muxUploadId && !lesson.muxAssetId) return lesson.videoStatus ?? null;
    const client = mux();
    const upload = lesson.muxUploadId
      ? await client.video.uploads.retrieve(lesson.muxUploadId)
      : null;
    const assetId = lesson.muxAssetId ?? upload?.asset_id;
    const asset = assetId ? await client.video.assets.retrieve(assetId) : null;
    const patch = patchFromPolled(upload, asset, assetId);
    if (!patch) return lesson.videoStatus ?? null;
    await ctx.runMutation(internal.muxData.mergeVideo, { lessonId, ...patch });
    return patch.videoStatus ?? lesson.videoStatus ?? null;
  },
});

/** Deletes the lesson's Mux asset and clears the video fields. */
export const removeVideo = action({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }): Promise<void> => {
    await requireAdmin(ctx);
    const lesson = await ctx.runQuery(internal.muxData.getLesson, { lessonId });
    if (!lesson) throw new ConvexError("NOT_FOUND");
    if (lesson.muxAssetId) await deleteAsset(mux(), lesson.muxAssetId);
    await ctx.runMutation(internal.muxData.setVideo, { lessonId });
  },
});
