"use client";

import { useAction, useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirm } from "@ui-sdk/react/alert-dialog";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage } from "./admin-utils";
import { StatusMessage } from "./admin-fields";
import { CourseForm } from "./course-form";
import { LessonsList } from "./lessons-list";
import { useAdminQuery } from "./use-admin-query";

export function CourseEditor({ courseId }: { courseId: Id<"courses"> }) {
  const data = useAdminQuery(api.admin.getCourse, { courseId });
  const router = useRouter();
  const deleteCourse = useMutation(api.admin.deleteCourse);
  const removeVideo = useAction(api.mux.removeVideo);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return <p className="text-muted">Loading course...</p>;
  if (data === null) return <p className="text-muted">Course not found.</p>;
  const { course, lessons } = data;

  async function onDelete() {
    const yes = await confirm({
      title: `Delete "${course.title}"?`,
      description: `This permanently deletes the course, its ${lessons.length} lesson(s), all enrollments and all progress. Lesson videos are removed from Mux. This cannot be undone.`,
      confirmLabel: "Delete course",
    });
    if (!yes) return;
    try {
      for (const lesson of lessons) {
        if (lesson.muxAssetId) await removeVideo({ lessonId: lesson._id });
      }
      await deleteCourse({ courseId });
      router.push("/admin");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted hover:text-fg">
          &larr; All courses
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl">{course.title}</h1>
          <Button type="button" variant="ghost" className="text-danger" onClick={() => void onDelete()}>
            Delete course
          </Button>
        </div>
        {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      </header>
      <CourseForm key={course._id} course={course} />
      <LessonsList courseId={courseId} lessons={lessons} />
    </div>
  );
}
