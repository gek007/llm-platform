"use client";

import { lazy, Suspense, type ReactNode } from "react";
import type { Slide as SlideData } from "../../../../convex/lib/engineTypes";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "./mermaid-diagram";

type Visual = NonNullable<SlideData["visual"]>;

// Recharts is only downloaded when a slide with a chart is shown.
const ChartVisual = lazy(() => import("./chart-visual"));

const CHART_NAMES = { bar: "Bar chart", line: "Line chart", pie: "Pie chart" } as const;

function Figure({ caption, className, children }: { caption?: string; className?: string; children: ReactNode }) {
  return (
    <figure className={cn("flex min-h-0 min-w-0 flex-col gap-[0.6em]", className)}>
      {children}
      {caption ? (
        <figcaption dir="auto" className="shrink-0 text-center text-[0.8em] text-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A box that takes the space the slide has left; diagrams and charts scale into it. */
function Flexible({ children }: { children: ReactNode }) {
  return <div className="relative min-h-[9em] flex-1">{children}</div>;
}

/**
 * Only a cell with a long unbroken run (an IPv6 address, a hash) may break mid-word. Letting every
 * cell do so makes the browser squeeze short columns until "CNAME" wraps.
 */
const hasLongToken = (text: string) => text.split(/\s+/).some((word) => word.length > 18);

function Loading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="absolute inset-0 animate-pulse rounded-[0.6em] bg-surface-2" />;
}

/**
 * Renders a slide's visual from its data. One branch per visual type in the deck schema
 * (convex/lib/deck.ts); none of them takes markup from the deck, only values.
 */
export function SlideVisual({ visual, className }: { visual: Visual; className?: string }) {
  switch (visual.type) {
    case "mermaid":
      return (
        <Figure caption={visual.caption} className={className}>
          <Flexible>
            <MermaidDiagram code={visual.code} label={visual.caption ?? "Diagram"} />
          </Flexible>
        </Figure>
      );
    case "chart": {
      const name = `${CHART_NAMES[visual.chartType]}${visual.caption ? `: ${visual.caption}` : ""}`;
      return (
        <Figure caption={visual.caption} className={className}>
          <Flexible>
            {/* The chart is a picture for sighted readers; this table is the same data for everyone else. */}
            {/* The wrapper is what is visually hidden: a table ignores the 1px box `sr-only` gives it. */}
            <div className="sr-only">
              <table>
                <caption>{name}</caption>
                <tbody>
                  {visual.data.map((point, i) => (
                    <tr key={`${i}-${point.label}`}>
                      <th scope="row">{point.label}</th>
                      <td>{point.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Suspense fallback={<Loading label="Loading chart" />}>
              <ChartVisual chartType={visual.chartType} data={visual.data} />
            </Suspense>
          </Flexible>
        </Figure>
      );
    }
    case "table":
      return (
        <Figure className={className}>
          {/* Never shrinks below its table (in either direction): a table that does not fit overflows, the stage sees it and scales the whole slide, instead of rows or columns being cut off here. */}
          <div className="my-auto w-fit min-w-full shrink-0 overflow-hidden rounded-[0.6em] border border-line">
            <table className="w-full border-collapse text-[0.95em]">
              <thead>
                <tr>
                  {visual.headers.map((header, i) => (
                    <th key={`${i}-${header}`} scope="col" dir="auto" className="border-b border-line-strong bg-surface-2 px-[0.8em] py-[0.5em] text-start font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visual.rows.map((row, r) => (
                  <tr key={`${r}-${row[0] ?? ""}`} className="border-t border-line first:border-t-0">
                    {row.map((cell, c) => (
                      <td key={`${c}-${cell}`} dir="auto" className={cn("px-[0.8em] py-[0.45em] align-top", hasLongToken(cell) && "[overflow-wrap:anywhere]")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Figure>
      );
    case "image_prompt":
      // A placeholder until images are generated: the alt text stands in for the picture. The
      // prompt is kept in the deck for that later step and is not shown to learners.
      return (
        <Figure className={className}>
          <div
            role="img"
            aria-label={visual.alt}
            className="flex min-h-[9em] flex-1 flex-col items-center justify-center gap-[0.6em] rounded-[0.6em] border border-dashed border-line-strong bg-surface-2 p-[1.2em] text-center"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[2.4em] w-[2.4em] text-subtle">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m4 17 5-4 4 3 3-2 4 3" />
            </svg>
            <p dir="auto" className="text-[0.95em] text-muted">
              {visual.alt}
            </p>
            <p className="text-[0.7em] uppercase tracking-wide text-subtle" dir="ltr" lang="en">
              Illustration placeholder
            </p>
          </div>
        </Figure>
      );
  }
}
