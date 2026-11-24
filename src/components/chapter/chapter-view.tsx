"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { signInHref } from "@/components/course/format";
import { RTL_LANGUAGES, type Language } from "../../../convex/lib/engineTypes";
import { api } from "../../../convex/_generated/api";
import { ChapterSidebar } from "./chapter-sidebar";
import { DeckError, DeckErrorBoundary, DeckSkeleton } from "./deck-states";
import { SlideDeck } from "./slide-deck";

export type ChapterData = NonNullable<FunctionReturnType<typeof api.chapters.getForViewer>>;

export function ChapterPage({ courseSlug, chapterSlug }: { courseSlug: string; chapterSlug: string }) {
  const data = useQuery(api.chapters.getForViewer, { courseSlug, chapterSlug });
  const viewer = useQuery(api.viewer.get);
  if (data === null) notFound();
  if (data === undefined || viewer === undefined) {
    return (
      <div aria-busy="true" aria-label="Loading chapter" className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
    );
  }
  return <ChapterView data={data} signedIn={viewer.signedIn} />;
}

const cta =
  "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-soft";

/**
 * The slides of a chapter, or what stands in for them:
 * - a deck → the viewer (inside an error boundary, so a deck that cannot render shows the error
 *   state instead of breaking the page);
 * - locked → the sign-in or upgrade prompt;
 * - no deck, and the viewer is an admin of a generated course → the generation's state: a skeleton
 *   while it is writing, an error with a way forward when it failed or finished without a deck;
 * - no deck otherwise (a hand-made or older chapter) → a pointer to the lessons, the text view.
 */
function ChapterDeck({ data, signedIn }: { data: ChapterData; signedIn: boolean }) {
  const { course, chapter, locked, deck, generation } = data;
  const language = course.language as Language;
  const returnTo = `/courses/${course.slug}/chapters/${chapter.slug}`;
  const regenerate =
    generation?.status === "ready" ? { jobId: generation.jobId, chapterOrder: chapter.order } : undefined;
  const jobHref = generation && !regenerate ? `/admin/generate/${generation.jobId}` : undefined;

  if (deck) {
    return (
      <DeckErrorBoundary
        key={`${chapter._id}:${deck.updatedAt}`}
        fallback={
          <DeckError
            title="These slides could not be displayed"
            detail="The saved deck has content the viewer cannot draw. The lessons below still cover this chapter."
            regenerate={regenerate}
            jobHref={jobHref}
          />
        }
      >
        <SlideDeck deck={deck} language={language} label={`${chapter.title} slides`} />
      </DeckErrorBoundary>
    );
  }
  if (locked) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="font-semibold">{signedIn ? "These slides are part of Pro" : "Sign in to view the slides"}</p>
        <p className="mt-1 text-sm text-muted">
          {signedIn ? "Upgrade to unlock every chapter in this course." : "Create a free account to access this chapter."}
        </p>
        <Link href={signedIn ? "/pricing" : signInHref(returnTo)} className={`${cta} mt-4`}>
          {signedIn ? "Upgrade to Pro" : "Sign in"}
        </Link>
      </div>
    );
  }
  if (generation?.status === "writing") return <DeckSkeleton />;
  if (generation?.status === "failed") {
    return (
      <DeckError
        title="Slide generation failed"
        detail={generation.error ?? "The course engine stopped before this chapter's slides were saved."}
        jobHref={jobHref}
      />
    );
  }
  if (generation?.status === "ready") {
    return (
      <DeckError
        title="This chapter has no slides"
        detail="The course was generated, but no slide deck is saved for this chapter."
        regenerate={regenerate}
      />
    );
  }
  return <p className="text-sm text-muted">No slides for this chapter yet. Its lessons below cover the material.</p>;
}

export function ChapterView({ data, signedIn }: { data: ChapterData; signedIn: boolean }) {
  const { course, chapter, chapters, lessons, test, prev, next } = data;
  const base = `/courses/${course.slug}`;
  const language = course.language as Language;
  const rtl = RTL_LANGUAGES.includes(language);
  const contentDir = rtl ? { dir: "rtl" as const, lang: language } : {};
  const returnTo = `${base}/chapters/${chapter.slug}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ChapterSidebar
        courseSlug={course.slug}
        courseTitle={course.title}
        chapters={chapters}
        currentSlug={chapter.slug}
        hasTest={test !== null}
        contentDir={rtl ? { dir: "rtl", lang: language } : undefined}
      />

      <div className="min-w-0 space-y-8">
        <header>
          <div {...contentDir}>
            <p className="text-xs text-subtle" dir="ltr" lang="en">
              Chapter {chapter.order}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">{chapter.title}</h1>
            <p className="mt-2 text-muted">{chapter.summary}</p>
          </div>
        </header>

        <section aria-labelledby="deck-heading">
          <h2 id="deck-heading" className="mb-3 scroll-mt-6 font-display text-xl font-semibold">
            Slides
          </h2>
          <ChapterDeck data={data} signedIn={signedIn} />
        </section>

        <section aria-labelledby="chapter-lessons-heading">
          <h2 id="chapter-lessons-heading" className="mb-3 scroll-mt-6 font-display text-xl font-semibold">
            Lessons
          </h2>
          <ol aria-label="Chapter lessons" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {lessons.map((lesson) => (
              <li key={lesson.slug} {...contentDir}>
                <Link href={`${base}/lessons/${lesson.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-surface-2">
                  <span>{lesson.title}</span>
                  {lesson.locked ? <span className="text-xs text-subtle" dir="ltr" lang="en">Locked</span> : null}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {test ? (
          <section aria-labelledby="test-heading" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="test-heading" className="font-display text-xl font-semibold">
              Chapter test
            </h2>
            <p className="mt-2 text-sm text-muted">
              {test.questionCount} questions · pass at {test.passPercent}% · {test.maxAttempts} attempts
            </p>
            <p className="mt-1 text-sm text-muted">
              {test.best
                ? `Best score: ${test.best.scorePercent}%${test.best.passed ? " (passed)" : ""} · Attempts used: ${test.attemptsUsed} of ${test.maxAttempts}`
                : `Attempts used: ${test.attemptsUsed} of ${test.maxAttempts}`}
            </p>
            <Link href={`${returnTo}/test`} className={`${cta} mt-4`}>
              {test.attemptsUsed === 0 ? "Take the test" : test.best?.passed ? "Review the test" : "Retake the test"}
            </Link>
          </section>
        ) : null}

        <nav aria-label="Chapter navigation" className="flex justify-between gap-4 text-sm">
          {prev ? (
            <Link href={`${base}/chapters/${prev.slug}`} className="text-accent hover:underline">
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`${base}/chapters/${next.slug}`} className="text-accent hover:underline">
              {next.title} →
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
