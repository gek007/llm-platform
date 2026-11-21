"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, slugify } from "./admin-utils";
import { StatusMessage } from "./admin-fields";

export function LessonsList({
  courseId,
  lessons,
}: {
  courseId: Id<"courses">;
  lessons: Doc<"lessons">[];
}) {
  const router = useRouter();
  const reorder = useMutation(api.admin.reorderLessons);
  const create = useMutation(api.admin.createLesson);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function move(index: number, delta: -1 | 1) {
    const ids = lessons.map((l) => l._id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      setError(null);
      await reorder({ courseId, lessonIds: ids });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name) return setError("Give the lesson a title.");
    const base = slugify(name) || "lesson";
    const taken = new Set(lessons.map((l) => l.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    try {
      setError(null);
      const id = await create({
        courseId,
        slug,
        title: name,
        summary: name,
        body: "",
        durationMinutes: 5,
        isFreePreview: false,
      });
      setTitle("");
      router.push(`/admin/courses/${courseId}/lessons/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section aria-labelledby="lessons-heading" className="flex flex-col gap-4">
      <h2 id="lessons-heading" className="text-xl font-semibold">
        Lessons ({lessons.length})
      </h2>
      {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      {lessons.length ? (
        <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
          {lessons.map((lesson, index) => (
            <li key={lesson._id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-sm text-subtle">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/courses/${courseId}/lessons/${lesson._id}`}
                  className="font-medium text-fg hover:text-accent-soft"
                >
                  {lesson.title}
                </Link>
                <p className="text-xs text-subtle">
                  {lesson.durationMinutes} min
                  {lesson.isFreePreview ? " · free preview" : ""}
                  {lesson.videoStatus ? ` · video ${lesson.videoStatus}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Move ${lesson.title} up`}
                disabled={index === 0}
                onClick={() => void move(index, -1)}
              >
                Up
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Move ${lesson.title} down`}
                disabled={index === lessons.length - 1}
                onClick={() => void move(index, 1)}
              >
                Down
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No lessons yet.</p>
      )}
      <form onSubmit={onAdd} className="flex items-center gap-2" aria-label="Add lesson">
        <Input value={title} onValueChange={setTitle} placeholder="New lesson title" aria-label="New lesson title" />
        <Button type="submit" variant="secondary">
          Add lesson
        </Button>
      </form>
    </section>
  );
}
