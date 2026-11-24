"use client";

import { useEffect, useRef, useState } from "react";
import { useDeckTheme } from "../deck-theme";

let nextId = 0;

/** Mermaid's `base` theme, coloured from the deck's own tokens so diagrams follow light and dark. */
function themeVariables(el: HTMLElement) {
  const styles = getComputedStyle(el);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const surface = token("--color-surface", "#0f1117");
  const raised = token("--color-surface-2", "#161923");
  const line = token("--color-line-strong", "#373e54");
  const text = token("--color-fg", "#efece4");
  const muted = token("--color-muted", "#9aa0b4");
  return {
    background: surface,
    primaryColor: raised,
    primaryTextColor: text,
    primaryBorderColor: line,
    secondaryColor: token("--color-surface-3", "#1e2230"),
    tertiaryColor: surface,
    lineColor: muted,
    textColor: text,
    mainBkg: raised,
    nodeBorder: line,
    clusterBkg: surface,
    clusterBorder: line,
    edgeLabelBackground: surface,
    actorBkg: raised,
    actorBorder: line,
    actorTextColor: text,
    signalColor: muted,
    signalTextColor: text,
    labelBoxBkgColor: raised,
    labelTextColor: text,
    noteBkgColor: token("--color-surface-3", "#1e2230"),
    noteTextColor: text,
    noteBorderColor: token("--color-accent", "#ff8a3d"),
    fontFamily: styles.fontFamily,
  };
}

/**
 * Draws one Mermaid diagram. The library (large) is loaded only when a slide with a diagram is
 * shown. Generated decks reach the database with diagrams that already parsed on the server, but a
 * hand-edited or older deck may not: a diagram that cannot be drawn shows a notice in its place
 * and logs a warning; the slide's text stays readable.
 */
export function MermaidDiagram({ code, label }: { code: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useDeckTheme();
  const drawing = `${theme}\n${code}`;
  const [result, setResult] = useState<{ drawing: string; ok: boolean } | null>(null);
  const state = result?.drawing === drawing ? (result.ok ? "ready" : "error") : "loading";

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    const id = `slide-diagram-${++nextId}`;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: themeVariables(el) });
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        // Mermaid's own SVG, which it sanitizes with DOMPurify at securityLevel "strict" (labels are
        // text, scripts and click handlers are dropped). The deck's `code` is never inserted as HTML.
        el.innerHTML = svg;
        const drawn = el.querySelector("svg");
        drawn?.setAttribute("role", "img");
        drawn?.setAttribute("aria-label", label);
        drawn?.removeAttribute("height");
        setResult({ drawing, ok: true });
      } catch (err) {
        // Mermaid leaves its scratch element behind when a render fails.
        document.getElementById(`d${id}`)?.remove();
        if (cancelled) return;
        console.warn("[SlideDeck] a diagram could not be drawn and was replaced with a notice", err);
        el.replaceChildren();
        setResult({ drawing, ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, drawing, label]);

  return (
    <div className="absolute inset-0" data-state={state}>
      {/* Diagrams read in their authored direction even in a right-to-left deck. */}
      <div ref={host} dir="ltr" className="slide-diagram flex h-full w-full items-center justify-center" />
      {state === "loading" ? (
        <div role="status" aria-label="Loading diagram" className="absolute inset-0 animate-pulse rounded-[0.6em] bg-surface-2" />
      ) : null}
      {state === "error" ? (
        <p role="note" className="absolute inset-0 flex items-center justify-center rounded-[0.6em] border border-dashed border-line-strong p-[1em] text-center text-[0.9em] text-muted">
          This diagram could not be displayed.
        </p>
      ) : null}
    </div>
  );
}
