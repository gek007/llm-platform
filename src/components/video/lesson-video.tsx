"use client";

import MuxPlayer from "@mux/mux-player-react/lazy";
import type { Id } from "../../../convex/_generated/dataModel";
import { usePlaybackTokens } from "./use-playback-tokens";

type Props = {
  lessonId: Id<"lessons">;
  title: string;
  courseTitle?: string;
  className?: string;
};

/**
 * Client-only Mux player (the lazy build loads the web component on demand). Videos are signed:
 * short-lived tokens are minted by Convex after an access check, and re-minted on a player error.
 */
export function LessonVideo({ lessonId, title, courseTitle, className }: Props) {
  const { state, refresh } = usePlaybackTokens(lessonId);

  return (
    <div
      className={
        className ?? "aspect-video overflow-hidden rounded-xl border border-line bg-black shadow-lift"
      }
    >
      {state.status === "ready" ? (
        <MuxPlayer
          playbackId={state.playbackId}
          tokens={state.tokens}
          streamType="on-demand"
          accentColor="#ff8a3d"
          title={title}
          metadata={{ video_title: title, ...(courseTitle ? { video_series: courseTitle } : {}) }}
          onError={refresh}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-white/80"
        >
          {state.status === "loading"
            ? "Loading video…"
            : state.status === "error"
              ? "The video could not be loaded. Reload the page to try again."
              : "This video is not available."}
        </div>
      )}
    </div>
  );
}
