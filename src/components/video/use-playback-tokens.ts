"use client";

import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type PlaybackState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | {
      status: "ready";
      playbackId: string;
      tokens: { playback: string; thumbnail: string; storyboard: string };
    };

/** Minimum gap between refreshes triggered by player errors (avoids a retry loop). */
const REFRESH_COOLDOWN_MS = 30_000;

/**
 * Mints signed Mux tokens for a lesson via `playback.getLessonTokens` on mount, and exposes
 * `refresh` (called on a player error such as an expired token, rate-limited).
 */
export function usePlaybackTokens(lessonId: Id<"lessons">) {
  const getTokens = useAction(api.playback.getLessonTokens);
  // Callers key the component by lesson, so state resets when the lesson changes.
  const [state, setState] = useState<PlaybackState>({ status: "loading" });
  const lastMint = useRef(0);
  const mounted = useRef(true);

  const mint = useCallback(() => {
    lastMint.current = Date.now();
    getTokens({ lessonId }).then(
      (result) => {
        if (!mounted.current) return;
        setState(
          result
            ? {
                status: "ready",
                playbackId: result.playbackId,
                tokens: {
                  playback: result.playback,
                  thumbnail: result.thumbnail,
                  storyboard: result.storyboard,
                },
              }
            : { status: "unavailable" },
        );
      },
      () => {
        if (mounted.current) setState({ status: "error" });
      },
    );
  }, [getTokens, lessonId]);

  useEffect(() => {
    mounted.current = true;
    mint();
    return () => {
      mounted.current = false;
    };
  }, [mint]);

  const refresh = useCallback(() => {
    if (Date.now() - lastMint.current < REFRESH_COOLDOWN_MS) return;
    mint();
  }, [mint]);

  return { state, refresh };
}
