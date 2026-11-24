"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { chapterHref, lessonHref } from "@/components/course/format";
import { api } from "../../../convex/_generated/api";
import { CourseCard } from "./course-card";
import { CatalogSkeleton } from "./course-catalog";

export function DashboardCourses() {
  const courses = useQuery(api.enrollments.listMine);

  if (courses === undefined) return <CatalogSkeleton />;
  if (courses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
        <p className="font-display text-xl font-semibold">You haven&apos;t enrolled in any courses yet</p>
        <p className="mt-2 text-sm text-muted">Pick a course to start learning.</p>
        <Link
          href="/courses"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-soft"
        >
          Browse courses
        </Link>
      </div>
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <li key={course._id}>
          <CourseCard
            course={{
              ...course,
              complete: course.complete,
              // A chapter the learner is about to start opens with its slides.
              continueHref: course.nextChapterSlug
                ? chapterHref(course.slug, course.nextChapterSlug)
                : course.nextLessonSlug
                  ? lessonHref(course.slug, course.nextLessonSlug)
                  : `/courses/${course.slug}`,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
