"use client";

import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { describeFailure, postAction } from "@/components/generate/api";
import { Button } from "@/components/ui/button";

/** Shown in place of the deck while the course engine is still writing it. */
export function DeckSkeleton() {
  return (
    <div role="status" aria-label="Generating slides" className="flex flex-col gap-3">
      <div className="h-1 rounded-full bg-surface-3" />
      <div className="flex aspect-[3/4] animate-pulse flex-col justify-center gap-4 rounded-xl border border-line bg-surface p-8 sm:aspect-video">
        <div className="h-3 w-16 rounded-full bg-surface-3" />
        <div className="h-9 w-2/3 rounded-lg bg-surface-3" />
        <div className="h-5 w-1/2 rounded-lg bg-surface-2" />
        <div className="h-5 w-2/5 rounded-lg bg-surface-2" />
      </div>
      <p className="text-sm text-muted">Generating slides for this chapter. They appear here as soon as they are saved.</p>
    </div>
  );
}

type Regenerate = { jobId: string; chapterOrder: number };

const REGENERATE_INSTRUCTION = "Rebuild the slide deck: the saved one is missing or could not be displayed.";

/** Asks the engine to rebuild this chapter's deck from its saved lessons (admins, generated courses). */
function RegenerateSlides({ jobId, chapterOrder }: Regenerate) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await postAction("regenerate", {
      jobId,
      target: { kind: "deck", chapterOrder },
      instruction: REGENERATE_INSTRUCTION,
    });
    setBusy(false);
    // On success the job turns to "writing" and the chapter query shows the skeleton by itself.
    if (!result.ok) {
      // A 409 on regenerate carries a ready-made message (the published-course refusal).
      setError(result.status === 409 && result.error !== "BAD_STATE" ? result.error : describeFailure(result));
    }
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <Button onClick={() => void regenerate()} disabled={busy}>
        {busy ? "Starting…" : "Regenerate chapter slides"}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * The deck's error state: what went wrong, and what to do about it. `regenerate` offers the
 * one-click rebuild; `jobHref` links to the generation job when the fix lives there (a failed job
 * is retried from its page).
 */
export function DeckError({
  title,
  detail,
  regenerate,
  jobHref,
}: {
  title: string;
  detail: string;
  regenerate?: Regenerate;
  jobHref?: string;
}) {
  return (
    <div role="alert" className="rounded-xl border border-danger/50 bg-surface p-6">
      <p className="font-semibold text-fg">{title}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      {regenerate ? <RegenerateSlides {...regenerate} /> : null}
      {jobHref ? (
        <Link href={jobHref} className="mt-4 inline-block text-sm text-accent hover:underline">
          Open the generation job
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Catches a deck that throws while rendering (data a newer or broken writer saved), so the rest of
 * the chapter page stays usable. Give it a `key` that changes with the deck to retry on new data.
 */
export class DeckErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[SlideDeck] the deck could not be rendered", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
