"use client";

import Link from "next/link";
import { useState } from "react";
import { LessonOutline, type OutlineChapter, type OutlineLesson } from "@/components/course/lesson-outline";
import { MenuIcon } from "@/components/course/icons";
import { Button } from "@/components/ui/button";

type Props = {
  courseSlug: string;
  courseTitle: string;
  lessons: OutlineLesson[];
  /** A chaptered course groups its lessons by chapter, each chapter starting with its slides. */
  chapters?: OutlineChapter[];
  completedIds: readonly string[];
  currentSlug: string;
};

/** Always visible on large screens; a collapsible panel below `lg`. */
export function LessonSidebar({ courseSlug, courseTitle, lessons, chapters, completedIds, currentSlug }: Props) {
  const [open, setOpen] = useState(false);
  const done = lessons.filter((l) => completedIds.includes(l._id)).length;
  return (
    <aside aria-label="Course outline" className="lg:sticky lg:top-6 lg:self-start">
      <Link href={`/courses/${courseSlug}`} className="text-sm font-semibold text-accent-soft hover:underline">
        {courseTitle}
      </Link>
      <p className="mt-1 text-xs text-subtle">
        {done} of {lessons.length} completed
      </p>
      <Button
        variant="secondary"
        className="mt-3 w-full lg:hidden"
        aria-expanded={open}
        aria-controls="lesson-sidebar-outline"
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon />
        {open ? "Hide lessons" : "Show lessons"}
      </Button>
      <div id="lesson-sidebar-outline" className={`mt-3 ${open ? "block" : "hidden"} lg:block`}>
        <LessonOutline
          courseSlug={courseSlug}
          lessons={lessons}
          chapters={chapters}
          completedIds={completedIds}
          currentSlug={currentSlug}
          compact
        />
      </div>
    </aside>
  );
}
