"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  RTL_LANGUAGES,
  type Language,
  type Slide as SlideData,
} from "../../../convex/lib/engineTypes";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Slide } from "./slide";

type SlideDeckProps = { slides: SlideData[]; language: Language; title: string };

/**
 * Arrow keys are handled on the focusable deck region, not on window, so they
 * never hijack arrows elsewhere on the page.
 */
export function SlideDeck({ slides, language, title }: SlideDeckProps) {
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const rtl = RTL_LANGUAGES.includes(language);

  if (slides.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        No slides yet.
      </p>
    );
  }

  const last = slides.length - 1;
  const current = Math.min(index, last);
  const go = (delta: number) => setIndex(Math.max(0, Math.min(last, current + delta)));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const forward = (event.key === "ArrowRight") !== rtl;
    go(forward ? 1 : -1);
  }

  function fullscreen() {
    void region.current?.requestFullscreen?.();
  }

  return (
    <div
      ref={region}
      role="region"
      aria-label={title}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...(rtl ? { dir: "rtl", lang: language } : {})}
      className="flex flex-col gap-4 bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Slide slide={slides[current]} />
      {showNotes ? (
        <aside aria-label="Notes" dir="auto" className="rounded-lg border border-line bg-surface-2 p-4 text-sm text-muted">
          {slides[current].notes}
        </aside>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => go(-1)} disabled={current === 0}>
          Prev
        </Button>
        <span aria-live="polite" className="text-sm text-muted">
          {current + 1} / {slides.length}
        </span>
        <Button variant="secondary" onClick={() => go(1)} disabled={current === last}>
          Next
        </Button>
        <Toggle pressed={showNotes} onPressedChange={setShowNotes} className="ms-auto">
          Speaker notes
        </Toggle>
        <Button variant="ghost" onClick={fullscreen}>
          Fullscreen
        </Button>
      </div>
    </div>
  );
}
