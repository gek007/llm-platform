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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { ChaptersPanel } from "./chapters-panel";
import { CourseForm } from "./course-form";
import { LessonsList } from "./lessons-list";
import { ResultsTable } from "./results-table";
import { useAdminQuery } from "./use-admin-query";

export function CourseEditor({ courseId }: { courseId: Id<"courses"> }) {
  const data = useAdminQuery(api.admin.getCourse, { courseId });
  const chapters = useAdminQuery(api.admin.listChapters, { courseId });
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
      <Tabs defaultValue="content" className="flex flex-col gap-6">
        <TabsList aria-label="Course sections" className="flex gap-2 border-b border-line">
          <TabsTab value="content" className="px-4 py-2 text-sm font-medium text-muted data-selected:border-b-2 data-selected:border-accent data-selected:text-fg">
            Content
          </TabsTab>
          <TabsTab value="results" className="px-4 py-2 text-sm font-medium text-muted data-selected:border-b-2 data-selected:border-accent data-selected:text-fg">
            Results
          </TabsTab>
        </TabsList>
        <TabsPanel value="content">
          {chapters === undefined ? (
            <p className="text-muted">Loading chapters...</p>
          ) : chapters.length > 0 ? (
            <ChaptersPanel
              courseId={courseId}
              chapters={chapters}
              language={course.language ?? "en"}
              jobId={course.generationJobId}
            />
          ) : (
            <LessonsList courseId={courseId} lessons={lessons} />
          )}
        </TabsPanel>
        <TabsPanel value="results">
          <ResultsTable courseId={courseId} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
