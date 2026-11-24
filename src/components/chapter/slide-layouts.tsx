import type { ComponentType, ReactNode } from "react";
import type { SlideLayout } from "../../../convex/lib/deck";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import { cn } from "@/lib/utils";
import { SlideVisual } from "./visuals/slide-visual";

/**
 * One component per layout of the deck schema. A layout only arranges the slide's data: it holds
 * no content of its own and takes no markup from the deck. Sizes are in `em`, relative to the font
 * size the stage sets from its width (slide-stage.tsx), so a layout never needs a breakpoint for
 * size; `@lg:` (stage at least 32rem wide) only switches side-by-side columns on.
 *
 * To add a layout: see "Adding a layout" in docs/features/course-engine.md.
 */

type LayoutProps = { slide: SlideData };

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 dir="auto" className="shrink-0 font-display text-[2em] leading-[1.15] font-semibold">
      {children}
    </h2>
  );
}

/** The area under the heading; its content sits in the middle and starts at the top when too tall. */
function Body({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="mt-[1.2em] flex min-h-0 flex-1 flex-col">
      <div className={cn("my-auto", className)}>{children}</div>
    </div>
  );
}

function Bullets({ items, className }: { items?: string[]; className?: string }) {
  if (!items?.length) return null;
  return (
    <ul className={cn("list-disc space-y-[0.55em] ps-[1.2em] text-[1.3em] leading-snug marker:text-accent", className)}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`} dir="auto">
          {item}
        </li>
      ))}
    </ul>
  );
}

function TitleSlide({ slide }: LayoutProps) {
  return (
    <div className="my-auto flex flex-col gap-[1em]">
      <span aria-hidden="true" className="h-[0.35em] w-[4.5em] rounded-full bg-accent" />
      <h2 dir="auto" className="font-display text-[3.2em] leading-[1.05] font-bold">
        {slide.title}
      </h2>
      {slide.bullets?.[0] ? (
        <p dir="auto" className="text-[1.5em] text-muted">
          {slide.bullets[0]}
        </p>
      ) : null}
    </div>
  );
}

function BulletsSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <Body>
        <Bullets items={slide.bullets} />
      </Body>
    </>
  );
}

function BulletsVisualSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <div className="mt-[1.2em] grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[1.4em] @lg:grid-cols-[4fr_7fr] @lg:grid-rows-1">
        <Bullets items={slide.bullets} className="self-center text-[1.15em]" />
        {slide.visual ? <SlideVisual visual={slide.visual} /> : null}
      </div>
    </>
  );
}

function VisualFullSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      {slide.visual ? <SlideVisual visual={slide.visual} className="mt-[1em] flex-1" /> : null}
    </>
  );
}

function TwoColumnSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <Body className="grid grid-cols-1 gap-[1.2em] @lg:grid-cols-2">
        {[slide.left, slide.right].map((items, column) => (
          <div key={column} className="rounded-[0.8em] border border-line bg-surface-2 p-[1.2em]">
            <Bullets items={items} className="text-[1.15em]" />
          </div>
        ))}
      </Body>
    </>
  );
}

function CodeSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <Body className="flex flex-col gap-[1em]">
        {slide.code ? (
          // Code keeps its own direction and wraps long lines instead of running off the slide.
          <figure dir="ltr" className="overflow-hidden rounded-[0.7em] border border-line bg-bg">
            <figcaption className="border-b border-line px-[1em] py-[0.4em] font-mono text-[0.7em] tracking-wide text-subtle uppercase">
              {slide.code.language}
            </figcaption>
            <pre className="p-[1em] font-mono text-[0.95em] leading-relaxed break-words whitespace-pre-wrap">
              <code>{slide.code.content}</code>
            </pre>
          </figure>
        ) : null}
        <Bullets items={slide.bullets} className="text-[1.05em]" />
      </Body>
    </>
  );
}

function QuoteSlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <Body>
        <blockquote dir="auto" className="border-s-[0.25em] border-accent ps-[1em] text-[1.7em] leading-snug italic">
          {slide.quote}
        </blockquote>
        {slide.attribution ? (
          <p dir="auto" className="mt-[1em] ps-[1.6em] text-[1em] text-muted">
            {slide.attribution}
          </p>
        ) : null}
      </Body>
    </>
  );
}

function SummarySlide({ slide }: LayoutProps) {
  return (
    <>
      <Heading>{slide.title}</Heading>
      <Body className="rounded-[0.8em] border border-line bg-surface-2 p-[1.4em]">
        <Bullets items={slide.bullets} className="list-[square] marker:text-iris" />
      </Body>
    </>
  );
}

/** Every layout of the schema has exactly one component; a missing one is a type error. */
export const SLIDE_LAYOUT_COMPONENTS: Record<SlideLayout, ComponentType<LayoutProps>> = {
  title: TitleSlide,
  bullets: BulletsSlide,
  "bullets+visual": BulletsVisualSlide,
  "visual-full": VisualFullSlide,
  "two-column": TwoColumnSlide,
  code: CodeSlide,
  quote: QuoteSlide,
  summary: SummarySlide,
};
