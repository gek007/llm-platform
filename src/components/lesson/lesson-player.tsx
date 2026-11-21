"use client";

import type { FunctionReturnType } from "convex/server";
import { formatDuration, stripLeadingTitle } from "@/components/course/format";
import { PreviewBadge } from "@/components/course/badges";
import type { OutlineLesson } from "@/components/course/lesson-outline";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { LessonVideo } from "@/components/video/lesson-video";
import type { api } from "../../../convex/_generated/api";
import { CompleteToggle } from "./complete-toggle";
import { LessonNav } from "./lesson-nav";
import { LessonSidebar } from "./lesson-sidebar";
import { LockedLesson } from "./locked-lesson";

export type LessonData = NonNullable<FunctionReturnType<typeof api.lessons.getForViewer>>;

type Props = {
  data: LessonData;
  outline: OutlineLesson[];
  completedIds: readonly string[];
  signedIn: boolean;
};

export function LessonPlayer({ data, outline, completedIds, signedIn }: Props) {
  const { course, lesson, locked, prev, next } = data;
  const returnTo = `/courses/${course.slug}/lessons/${lesson.slug}`;
  const completed = completedIds.includes(lesson._id);
  const body = "body" in lesson ? lesson.body : undefined;

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
        completedIds={completedIds}
        currentSlug={lesson.slug}
      />
      <article className="min-w-0">
        <header className="mb-6">
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
              <LessonMarkdown source={stripLeadingTitle(body, lesson.title)} />
            </div>
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
        <LessonNav courseSlug={course.slug} prev={prev} next={next} />
      </article>
    </div>
  );
}
