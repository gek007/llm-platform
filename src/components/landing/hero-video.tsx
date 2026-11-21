"use client";

import MuxPlayer from "@mux/mux-player-react/lazy";
import { motion } from "motion/react";
import { useState } from "react";

type HeroVideoProps = {
  playbackId: string;
  title: string;
  durationLabel: string;
  phase: number;
  phaseDurationMs: number;
  reduced: boolean;
};

/**
 * Click-to-play Mux preview inside HeroDemo: renders a lightweight Mux poster facade
 * with the animated scrubber until clicked, then mounts the lazy Mux Player on demand.
 */
export function HeroVideo({
  playbackId,
  title,
  durationLabel,
  phase,
  phaseDurationMs,
  reduced,
}: HeroVideoProps) {
  const [playing, setPlaying] = useState(false);
  const posterUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?width=640&time=2`;

  if (playing) {
    return (
      <div
        data-testid="hero-video-player"
        className="relative aspect-video overflow-hidden rounded-lg bg-black"
      >
        <MuxPlayer
          playbackId={playbackId}
          streamType="on-demand"
          autoPlay
          accentColor="#ff8a3d"
          title={title}
          metadata={{ video_title: title, video_series: "Learnly" }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="hero-video-trigger"
      aria-label={`Play ${title}`}
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-linear-to-br from-surface-3 via-surface-2 to-bg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-bg/85 via-bg/25 to-bg/20"
      />
      <span
        aria-hidden="true"
        className="absolute right-2.5 top-2.5 rounded-full border border-line-strong/80 bg-bg/75 px-2 py-0.5 font-mono text-[10px] text-fg backdrop-blur-xs"
      >
        {durationLabel}
      </span>
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-fg shadow-glow transition-transform duration-200 group-hover:scale-105">
          <svg viewBox="0 0 16 16" className="ml-0.5 size-5" fill="currentColor">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-line-strong/80"
      >
        <motion.div
          className="h-full origin-left rounded-full bg-accent"
          key={reduced ? "static" : `video-${phase === 0}`}
          initial={{ scaleX: reduced ? 0.6 : 0 }}
          animate={{ scaleX: reduced ? 0.6 : phase === 0 ? 0.55 : 0.6 }}
          transition={{ duration: reduced ? 0 : phase === 0 ? phaseDurationMs / 1000 : 0 }}
        />
      </div>
    </button>
  );
}
