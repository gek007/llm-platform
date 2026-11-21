"use client";

import MuxPlayer from "@mux/mux-player-react/lazy";

type Props = {
  playbackId: string;
  title: string;
  courseTitle?: string;
};

/** Client-only Mux player (the lazy build loads the web component on demand). */
export function LessonVideo({ playbackId, title, courseTitle }: Props) {
  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-line bg-black shadow-lift">
      <MuxPlayer
        playbackId={playbackId}
        streamType="on-demand"
        accentColor="#ff8a3d"
        title={title}
        metadata={{ video_title: title, ...(courseTitle ? { video_series: courseTitle } : {}) }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
