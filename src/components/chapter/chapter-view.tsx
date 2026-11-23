"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { signInHref } from "@/components/course/format";
import { RTL_LANGUAGES, type Language } from "../../../convex/lib/engineTypes";
import { api } from "../../../convex/_generated/api";
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

export function ChapterView({ data, signedIn }: { data: ChapterData; signedIn: boolean }) {
  const { course, chapter, locked, deck, lessons, test, prev, next } = data;
  const base = `/courses/${course.slug}`;
  const language = course.language as Language;
  const rtl = RTL_LANGUAGES.includes(language);
  const contentDir = rtl ? { dir: "rtl" as const, lang: language } : {};
  const returnTo = `${base}/chapters/${chapter.slug}`;

  return (
    <div className="space-y-8">
      <header>
        <Link href={base} className="text-sm text-muted hover:text-fg">
          {course.title}
        </Link>
        <div {...contentDir}>
          <p className="mt-3 text-xs text-subtle" dir="ltr" lang="en">
            Chapter {chapter.order}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">{chapter.title}</h1>
          <p className="mt-2 text-muted">{chapter.summary}</p>
        </div>
      </header>

      <section aria-labelledby="deck-heading">
        <h2 id="deck-heading" className="mb-3 font-display text-xl font-semibold">
          Slides
        </h2>
        {deck ? (
          <SlideDeck key={chapter._id} slides={deck.slides} language={language} title={`${chapter.title} slides`} />
        ) : locked ? (
          <div className="rounded-xl border border-line bg-surface p-6 text-center">
            <p className="font-semibold">{signedIn ? "These slides are part of Pro" : "Sign in to view the slides"}</p>
            <p className="mt-1 text-sm text-muted">
              {signedIn ? "Upgrade to unlock every chapter in this course." : "Create a free account to access this chapter."}
            </p>
            <Link href={signedIn ? "/pricing" : signInHref(returnTo)} className={`${cta} mt-4`}>
              {signedIn ? "Upgrade to Pro" : "Sign in"}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">No slides for this chapter yet.</p>
        )}
      </section>

      <section aria-labelledby="chapter-lessons-heading">
        <h2 id="chapter-lessons-heading" className="mb-3 font-display text-xl font-semibold">
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
  );
}
