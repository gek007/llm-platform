"use client";

import { useQuery } from "convex/react";
import { notFound } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { LessonPlayer } from "./lesson-player";

export function LessonView({ courseSlug, lessonSlug }: { courseSlug: string; lessonSlug: string }) {
  const data = useQuery(api.lessons.getForViewer, { courseSlug, lessonSlug });
  const course = useQuery(api.courses.getBySlug, { slug: courseSlug });
  const viewer = useQuery(api.viewer.get);
  const completed = useQuery(api.progress.forCourse, data ? { courseId: data.course._id } : "skip");

  if (data === null || course === null) notFound();
  if (data === undefined || course === undefined || viewer === undefined) return <LessonSkeleton />;

  return (
    <LessonPlayer
      data={data}
      outline={course.lessons}
      completedIds={completed ?? []}
      signedIn={viewer.signedIn}
    />
  );
}

export function LessonSkeleton() {
  return (
    <div
      className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr]"
      aria-busy="true"
      aria-label="Loading lesson"
    >
      <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="space-y-4">
        <div className="h-10 w-2/3 animate-pulse rounded bg-surface" />
        <div className="aspect-video animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    </div>
  );
}
