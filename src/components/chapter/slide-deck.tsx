"use client";

import { Progress, ProgressIndicator, ProgressTrack } from "@ui-sdk/react/progress";
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import type { RenderableDeck, RenderableSlide } from "../../../convex/lib/deck";
import { RTL_LANGUAGES, type Language } from "../../../convex/lib/engineTypes";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { DeckThemeContext, useStoredDeckTheme } from "./deck-theme";
import { Slide } from "./slide";
import { LANGUAGE_NAMES, useNarration } from "./use-narration";

type SlideDeckProps = {
  /** The deck JSON: `{ chapterId, title, slides }`. Everything shown comes from it. */
  deck: RenderableDeck;
  language: Language;
  /** The deck region's accessible name; defaults to the deck's title. */
  label?: string;
};

const VISUAL_NAMES = { mermaid: "Diagram", chart: "Chart", table: "Table", image_prompt: "Illustration" } as const;
const SWIPE_PX = 48;

function slideKind(slide: RenderableSlide): string | null {
  if (slide.visual) return VISUAL_NAMES[slide.visual.type];
  return slide.layout === "code" ? "Code" : slide.layout === "quote" ? "Quote" : null;
}

/**
 * The deck viewer: one slide at a time, with the controls around it. It renders a deck's JSON and
 * nothing else, so the same JSON can feed another renderer later (a PPTX export, for one).
 *
 * Keys are handled on the focusable deck region, not on window, so they never hijack keys
 * elsewhere on the page: arrows (mirrored in a right-to-left deck), Space and Shift+Space,
 * PageUp/PageDown, Home/End, and Escape for the overview of all slides.
 */
export function SlideDeck({ deck, language, label }: SlideDeckProps) {
  const { slides } = deck;
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [overview, setOverview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [theme, setTheme] = useStoredDeckTheme();
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [noVoice, setNoVoice] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const rtl = RTL_LANGUAGES.includes(language);

  const last = slides.length - 1;
  const current = Math.max(0, Math.min(index, last));
  const slide = slides[current] as RenderableSlide | undefined;
  const goTo = (target: number) => setIndex(Math.max(0, Math.min(last, target)));
  const go = (delta: number) => goTo(current + delta);

  // Narration reads the slide's speaker notes aloud; when they end it moves to the next slide and
  // keeps reading, like a presenter, until the last slide (or stops after one with auto-advance off).
  const narration = useNarration({
    slideKey: slide?.id ?? "",
    text: slide?.notes ?? "",
    language,
    paused: overview,
    onSlideEnd: () => {
      if (!autoAdvance || current >= last) return false;
      setIndex(current + 1);
      return true;
    },
  });

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === region.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!slide) {
    return (
      <p role="status" className="text-sm text-muted">
        No slides yet.
      </p>
    );
  }

  function listen(on: boolean) {
    if (!on) return narration.stop();
    // A device may have no voice for the course's language; say so rather than stay silent.
    setNoVoice(!narration.play());
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const onControl = target !== region.current && target.closest("button, a, input, textarea, select") !== null;
    let handled = true;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft":
        go((event.key === "ArrowRight") !== rtl ? 1 : -1);
        break;
      case "PageDown":
        go(1);
        break;
      case "PageUp":
        go(-1);
        break;
      case "Home":
        goTo(0);
        break;
      case "End":
        goTo(last);
        break;
      case " ":
        // Space on a button presses that button.
        if (onControl) return;
        go(event.shiftKey ? -1 : 1);
        break;
      case "Enter":
        if (onControl || !overview) return;
        setOverview(false);
        break;
      case "Escape":
        // In fullscreen the browser uses Escape to leave it.
        if (document.fullscreenElement) return;
        setOverview((open) => !open);
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void region.current?.requestFullscreen?.();
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined || Math.abs(end - start) < SWIPE_PX) return;
    // Swiping towards the start of the line moves forward, as turning a page does.
    go((end < start) !== rtl ? 1 : -1);
  }

  return (
    <DeckThemeContext value={theme}>
      <div
        ref={region}
        role="region"
        aria-label={label ?? deck.title}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-theme={theme}
        {...(rtl ? { dir: "rtl", lang: language } : {})}
        className="slide-deck flex flex-col gap-3 rounded-xl bg-bg text-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <Progress value={((current + 1) / slides.length) * 100} aria-label="Deck progress">
          <ProgressTrack className="block h-1 overflow-hidden rounded-full bg-surface-3">
            <ProgressIndicator className="block h-full rounded-full bg-accent transition-[width] duration-200" />
          </ProgressTrack>
        </Progress>

        {overview ? (
          <ol aria-label="All slides" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {slides.map((item, i) => {
              const kind = slideKind(item);
              return (
                <li key={item.id}>
                  <Button
                    variant="secondary"
                    aria-current={i === current ? "true" : undefined}
                    aria-label={`Slide ${i + 1}: ${item.title}`}
                    onClick={() => {
                      goTo(i);
                      setOverview(false);
                    }}
                    className="aspect-video h-auto w-full flex-col items-start justify-between p-3 text-start aria-[current=true]:border-accent"
                  >
                    <span className="text-xs text-subtle" dir="ltr">
                      {i + 1}
                    </span>
                    <span dir="auto" className="line-clamp-3 text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted">{kind ?? " "}</span>
                  </Button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div onTouchStart={(e) => (touchStart.current = e.touches[0]?.clientX ?? null)} onTouchEnd={onTouchEnd}>
            <Slide key={slide.id} slide={slide} />
          </div>
        )}

        {narration.caption ? (
          // The sentence being read, as a caption: for following along and for anyone without sound.
          <p data-slot="narration-caption" dir="auto" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-center text-sm text-fg">
            {narration.caption}
          </p>
        ) : null}

        {showNotes && !overview ? (
          <aside aria-label="Notes" dir="auto" className="rounded-lg border border-line bg-surface-2 p-4 text-sm text-muted">
            {slide.notes}
          </aside>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => go(-1)} disabled={current === 0}>
            Prev
          </Button>
          <span aria-live="polite" className="min-w-14 text-center text-sm text-muted" dir="ltr">
            {current + 1} / {slides.length}
          </span>
          <Button variant="secondary" onClick={() => go(1)} disabled={current === last}>
            Next
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {narration.supported ? (
              <>
                <Toggle pressed={narration.playing} onPressedChange={listen}>
                  Listen
                </Toggle>
                <Toggle pressed={autoAdvance} onPressedChange={setAutoAdvance}>
                  Auto-advance
                </Toggle>
              </>
            ) : null}
            <Toggle pressed={overview} onPressedChange={setOverview}>
              Overview
            </Toggle>
            <Toggle pressed={showNotes} onPressedChange={setShowNotes}>
              Speaker notes
            </Toggle>
            <Toggle pressed={theme === "light"} onPressedChange={(light) => setTheme(light ? "light" : "dark")}>
              Light slides
            </Toggle>
            <Button variant="ghost" onClick={toggleFullscreen}>
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          </div>
        </div>
        {noVoice ? (
          <p role="status" className="text-sm text-muted" dir="ltr" lang="en">
            This device has no {LANGUAGE_NAMES[language]} voice, so these slides cannot be read aloud here. Speaker notes
            show the same text.
          </p>
        ) : null}
      </div>
    </DeckThemeContext>
  );
}
