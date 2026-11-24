"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Below this the text would be too small to read, so the slide is clipped instead. */
export const MIN_FIT = 0.6;

/**
 * How much a slide's content must shrink to fit its stage along one axis. `clipped` means even
 * `MIN_FIT` is not enough: the content is cut off at the stage's edge (it never spills) and a
 * warning is logged.
 */
export function fitScale(content: number, available: number): { scale: number; clipped: boolean } {
  if (available <= 0 || content <= available + 1) return { scale: 1, clipped: false };
  const scale = available / content;
  return scale >= MIN_FIT ? { scale, clipped: false } : { scale: MIN_FIT, clipped: true };
}

type Fit = { scale: number; origin: "center" | "start" };

/**
 * The fixed frame every slide is drawn in: 16:9 (3:4 when the deck is narrower than 32rem, so a
 * phone gets readable text). The frame sets the font size from its own width (container query
 * units) and layouts size everything in `em`, so a slide looks the same at any width, inline or
 * fullscreen, with no script. Content that is still taller or wider than the frame (a long list, a
 * wide table) is scaled down to fit; nothing is ever drawn outside the frame.
 */
export function SlideStage({ slideId, children }: { slideId?: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, origin: "center" });

  useEffect(() => {
    const el = content.current;
    if (!el) return;
    let warned = false;
    const measure = () => {
      // Layout sizes: the transform below does not change them, so measuring cannot loop.
      const tall = fitScale(el.scrollHeight, el.clientHeight);
      const wide = fitScale(el.scrollWidth, el.clientWidth);
      if ((tall.clipped || wide.clipped) && !warned) {
        warned = true;
        console.warn(
          `[SlideDeck] slide "${slideId ?? "?"}" has more content than fits at ${MIN_FIT * 100}% scale and is clipped. Shorten it.`,
        );
      }
      // Too tall: shrink towards the top, centred. Too wide: the overflow is all on the far side,
      // so shrink towards the near corner or the far edge would still be cut off.
      const next: Fit = { scale: Math.min(tall.scale, wide.scale), origin: wide.scale < 1 ? "start" : "center" };
      setFit((prev) => (prev.scale === next.scale && prev.origin === next.origin ? prev : next));
    };
    // The frame resizes with the page; its content grows when a lazy diagram or chart arrives.
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    const mutated = new MutationObserver(measure);
    mutated.observe(el, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      mutated.disconnect();
    };
  }, [slideId]);

  return (
    <div className="slide-stage @container w-full">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-surface text-[length:calc(100cqw/30)] text-fg @lg:aspect-video @lg:text-[length:calc(100cqw/60)]">
        <div
          ref={content}
          data-slot="slide-content"
          data-fitted={fit.scale < 1 ? fit.origin : undefined}
          style={{ "--slide-fit": fit.scale } as CSSProperties}
          className="absolute inset-0 flex origin-top flex-col p-[2.2em] [transform:scale(var(--slide-fit))] data-[fitted=start]:origin-top-left rtl:data-[fitted=start]:origin-top-right"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
