"use client";

import { useMutation, useAction } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirm } from "@ui-sdk/react/alert-dialog";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage } from "./admin-utils";
import { StatusMessage } from "./admin-fields";
import { LessonForm } from "./lesson-form";
import { useAdminQuery } from "./use-admin-query";
import { VideoPanel } from "./video-panel";

export function LessonEditor({ lessonId }: { lessonId: Id<"lessons"> }) {
  const data = useAdminQuery(api.admin.getLesson, { lessonId });
  const router = useRouter();
  const deleteLesson = useMutation(api.admin.deleteLesson);
  const removeVideo = useAction(api.mux.removeVideo);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return <p className="text-muted">Loading lesson...</p>;
  if (data === null) return <p className="text-muted">Lesson not found.</p>;
  const { lesson, course } = data;

  async function onDelete() {
    const yes = await confirm({
      title: `Delete "${lesson.title}"?`,
      description: "The lesson, its video and everyone's progress on it are deleted. This cannot be undone.",
      confirmLabel: "Delete lesson",
    });
    if (!yes) return;
    try {
      if (lesson.muxAssetId) await removeVideo({ lessonId });
      await deleteLesson({ lessonId });
      router.push(`/admin/courses/${course._id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href={`/admin/courses/${course._id}`} className="text-sm text-muted hover:text-fg">
          &larr; {course.title}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl">{lesson.title}</h1>
          <Button type="button" variant="ghost" className="text-danger" onClick={() => void onDelete()}>
            Delete lesson
          </Button>
        </div>
        {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      </header>
      <VideoPanel lesson={lesson} />
      <LessonForm key={lesson._id} lesson={lesson} />
    </div>
  );
}
