"use client";

import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { chapterHref, formatDuration, slidesHref, stripLeadingTitle } from "@/components/course/format";
import { PreviewBadge } from "@/components/course/badges";
import { SlidesIcon } from "@/components/course/icons";
import type { OutlineChapter, OutlineLesson } from "@/components/course/lesson-outline";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { LessonVideo } from "@/components/video/lesson-video";
import type { api } from "../../../convex/_generated/api";
import { chapterOfLesson } from "../../../convex/lib/coursePath";
import { CompleteToggle } from "./complete-toggle";
import { LessonSources } from "./lesson-sources";
import { LessonNav, type NavTarget } from "./lesson-nav";
import { LessonSidebar } from "./lesson-sidebar";
import { LockedLesson } from "./locked-lesson";

export type LessonData = NonNullable<FunctionReturnType<typeof api.lessons.getForViewer>>;

type Props = {
  data: LessonData;
  outline: OutlineLesson[];
  /** The course's chapters (empty for a course without chapters). */
  chapters?: OutlineChapter[];
  completedIds: readonly string[];
  signedIn: boolean;
};

export function LessonPlayer({ data, outline, chapters = [], completedIds, signedIn }: Props) {
  // A deployment that predates the course engine returns no `language` or `sources`;
  // default both so the page still renders against an older backend.
  const { course, lesson, locked, prev, next, language = "en", sources = [] } = data;
  const returnTo = `/courses/${course.slug}/lessons/${lesson.slug}`;
  const completed = completedIds.includes(lesson._id);
  const body = "body" in lesson ? lesson.body : undefined;

  // Slides first: the lesson says which chapter it belongs to and links to that chapter's deck, and
  // "Next" from a chapter's last lesson opens the next chapter's slides, not its first lesson.
  const chapter = chapterOfLesson(lesson._id, chapters);
  const nextLesson = next ? outline.find((l) => l.slug === next.slug) : undefined;
  const nextChapter = nextLesson ? chapterOfLesson(nextLesson._id, chapters) : undefined;
  const nextTarget: NavTarget | null =
    next && nextChapter && nextChapter !== chapter && nextChapter.hasDeck
      ? {
          ...next,
          title: nextChapter.title,
          href: slidesHref(course.slug, nextChapter.slug),
          kicker: `Next: chapter ${nextChapter.order} slides`,
        }
      : next;

  return (
    <div
      data-course-slug={course.slug}
      data-lesson-slug={lesson.slug}
      className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr]"
    >
      <LessonSidebar
        courseSlug={course.slug}
        courseTitle={course.title}
        lessons={outline}
        chapters={chapters}
        completedIds={completedIds}
        currentSlug={lesson.slug}
      />
      <article className="min-w-0">
        <header className="mb-6">
          {chapter ? (
            <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link href={chapterHref(course.slug, chapter.slug)} className="text-muted hover:text-fg hover:underline">
                Chapter {chapter.order}: <span dir="auto">{chapter.title}</span>
              </Link>
              {chapter.hasDeck ? (
                <Link
                  href={slidesHref(course.slug, chapter.slug)}
                  className="inline-flex items-center gap-1.5 font-medium text-accent-soft hover:underline"
                >
                  <SlidesIcon width={14} height={14} />
                  Chapter slides
                </Link>
              ) : null}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span>Lesson {lesson.order}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(lesson.durationMinutes)}</span>
            {lesson.isFreePreview ? <PreviewBadge /> : null}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">{lesson.title}</h1>
        </header>

        {locked || body === undefined ? (
          <LockedLesson
            title={lesson.title}
            summary={lesson.summary}
            signedIn={signedIn}
            tier={course.tier}
            returnTo={returnTo}
          />
        ) : (
          <>
            {lesson.hasVideo ? (
              <div className="mb-8">
                <LessonVideo key={lesson._id} lessonId={lesson._id} title={lesson.title} courseTitle={course.title} />
              </div>
            ) : null}
            <div className="prose-lesson">
              <LessonMarkdown source={stripLeadingTitle(body, lesson.title)} language={language} />
            </div>
            <LessonSources sources={sources} />
            <div className="mt-10 border-t border-line pt-6">
              <CompleteToggle
                lessonId={lesson._id}
                courseId={course._id}
                completed={completed}
                signedIn={signedIn}
                returnTo={returnTo}
              />
            </div>
          </>
        )}
        <LessonNav courseSlug={course.slug} prev={prev} next={nextTarget} />
      </article>
    </div>
  );
}
