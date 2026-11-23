"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { notFound } from "next/navigation";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { formatDuration, lessonHref } from "@/components/course/format";
import { api } from "../../../convex/_generated/api";
import { LevelBadge, TierBadge } from "./badges";
import { EnrollButton } from "./enroll-button";
import { LessonOutline } from "./lesson-outline";
import { ProgressBar } from "./progress-bar";

type Course = NonNullable<FunctionReturnType<typeof api.courses.getBySlug>>;

export function CourseDetail({ slug }: { slug: string }) {
  const course = useQuery(api.courses.getBySlug, { slug });
  if (course === undefined) return <CourseDetailSkeleton />;
  if (course === null) notFound();
  return <CourseDetailLoaded course={course} />;
}

function CourseDetailLoaded({ course }: { course: Course }) {
  const viewer = useQuery(api.viewer.get);
  const completed = useQuery(api.progress.forCourse, { courseId: course._id }) ?? [];
  const enrolled = useQuery(api.enrollments.isEnrolled, { courseId: course._id }) ?? false;

  const done = new Set<string>(completed);
  const total = course.lessons.length;
  const totalMinutes = course.lessons.reduce((sum, l) => sum + l.durationMinutes, 0);
  const previews = course.lessons.filter((l) => l.isFreePreview).length;
  const nextLesson =
    course.lessons.find((l) => !done.has(l._id) && !l.locked) ?? course.lessons.find((l) => !l.locked) ?? course.lessons[0];
  const continueHref = nextLesson ? lessonHref(course.slug, nextLesson.slug) : `/courses/${course.slug}`;
  const completedCount = course.lessons.filter((l) => done.has(l._id)).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="rounded-2xl border border-line bg-surface p-6 shadow-soft sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={course.tier} />
          <LevelBadge level={course.level} />
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">{course.title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">{course.summary}</p>
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-subtle">Lessons</dt>
            <dd className="font-semibold">{total}</dd>
          </div>
          <div>
            <dt className="text-subtle">Total time</dt>
            <dd className="font-semibold">{formatDuration(totalMinutes)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Free previews</dt>
            <dd className="font-semibold">{previews}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-col gap-5 sm:max-w-md">
          <EnrollButton
            courseId={course._id}
            courseSlug={course.slug}
            tier={course.tier}
            viewer={viewer}
            enrolled={enrolled}
            continueHref={continueHref}
          />
          {enrolled ? (
            <ProgressBar done={completedCount} total={total} label="Course progress" />
          ) : null}
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="font-display text-2xl font-semibold">
              About this course
            </h2>
            <div className="prose-lesson mt-4">
              <LessonMarkdown source={course.description} language={course.language} />
            </div>
          </section>
          {course.outcomes.length > 0 ? (
            <section aria-labelledby="outcomes-heading" className="mt-10">
              <h2 id="outcomes-heading" className="font-display text-2xl font-semibold">
                What you&apos;ll learn
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm text-muted">
                    <span className="mt-0.5 text-success" aria-hidden="true">
                      ✓
                    </span>
                    {outcome}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <section aria-labelledby="outline-heading">
          <h2 id="outline-heading" className="mb-4 font-display text-2xl font-semibold">
            Lessons
          </h2>
          <LessonOutline
            courseSlug={course.slug}
            lessons={course.lessons}
            completedIds={completed}
            chapters={course.chapters}
          />
        </section>
      </div>
    </div>
  );
}

export function CourseDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading course">
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="mt-10 h-72 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
