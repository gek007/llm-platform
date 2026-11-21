"use node";

import Mux from "@mux/mux-node";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { claimsIsAdmin, claimsIsPlan, PRO_PLAN_SLUG } from "./lib/auth";

/** Lifetime of minted playback tokens. */
export const TOKEN_TTL_SECONDS = 2 * 60 * 60;

export type PlaybackTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
  /** Unix ms when the tokens expire. */
  expiresAt: number;
};

export type LessonTokens = PlaybackTokens & { playbackId: string };

/** Signs Mux playback, thumbnail and storyboard JWTs (RS256) for one playback ID. */
export async function signPlaybackTokens(
  playbackId: string,
  key: { keyId: string; keySecret: string },
  nowMs: number = Date.now(),
): Promise<PlaybackTokens> {
  const client = new Mux({ tokenId: "unused", tokenSecret: "unused" });
  const tokens = await client.jwt.signPlaybackId(playbackId, {
    keyId: key.keyId,
    keySecret: key.keySecret,
    expiration: `${TOKEN_TTL_SECONDS}s`,
    type: ["video", "thumbnail", "storyboard"],
  });
  return {
    playback: tokens["playback-token"] ?? "",
    thumbnail: tokens["thumbnail-token"] ?? "",
    storyboard: tokens["storyboard-token"] ?? "",
    expiresAt: nowMs + TOKEN_TTL_SECONDS * 1000,
  };
}

/**
 * Short-lived signed Mux tokens for a lesson's video. Access is re-checked server-side with the
 * caller's identity (locked lesson, draft course for non-admins, or no ready video -> null).
 * Admins pass the access check, so the admin preview player uses this too.
 */
export const getLessonTokens = action({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }): Promise<LessonTokens | null> => {
    const identity = await ctx.auth.getUserIdentity();
    const playbackId = await ctx.runQuery(internal.playbackData.resolveLessonPlayback, {
      lessonId,
      subject: identity?.subject,
      admin: claimsIsAdmin(identity),
      proClaim: claimsIsPlan(identity, PRO_PLAN_SLUG),
    });
    if (!playbackId) return null;
    const keyId = process.env.MUX_SIGNING_KEY_ID;
    const keySecret = process.env.MUX_SIGNING_PRIVATE_KEY;
    if (!keyId || !keySecret) throw new ConvexError("MUX_SIGNING_NOT_CONFIGURED");
    return { playbackId, ...(await signPlaybackTokens(playbackId, { keyId, keySecret })) };
  },
});
