import type { ReactNode } from "react";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";

function List({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc space-y-2 ps-6">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} dir="auto">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-72 flex-col justify-center gap-6 rounded-xl border border-line bg-surface-1 p-8 text-fg">
      {children}
    </div>
  );
}

export function Slide({ slide }: { slide: SlideData }) {
  const heading = (
    <h2 dir="auto" className="text-2xl font-semibold">
      {slide.title}
    </h2>
  );
  switch (slide.layout) {
    case "title":
      return (
        <Frame>
          <h2 dir="auto" className="text-4xl font-bold">
            {slide.title}
          </h2>
          {slide.bullets?.[0] ? (
            <p dir="auto" className="text-lg text-muted">
              {slide.bullets[0]}
            </p>
          ) : null}
        </Frame>
      );
    case "two-column":
      return (
        <Frame>
          {heading}
          <div className="grid gap-6 md:grid-cols-2">
            <List items={slide.left} />
            <List items={slide.right} />
          </div>
        </Frame>
      );
    case "quote":
      return (
        <Frame>
          {heading}
          <blockquote dir="auto" className="border-s-4 border-accent ps-4 text-xl italic">
            {slide.quote}
          </blockquote>
          {slide.attribution ? (
            <p dir="auto" className="text-sm text-muted">
              {slide.attribution}
            </p>
          ) : null}
        </Frame>
      );
    case "summary":
    case "bullets":
      return (
        <Frame>
          {heading}
          <List items={slide.bullets} />
        </Frame>
      );
  }
}
