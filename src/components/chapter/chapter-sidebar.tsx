"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon } from "@/components/course/icons";
import { Button } from "@/components/ui/button";

export type SidebarChapter = { slug: string; title: string; order: number; hasDeck: boolean };

type Props = {
  courseSlug: string;
  courseTitle: string;
  chapters: SidebarChapter[];
  currentSlug: string;
  /** Whether the current chapter has a test (it gets a link under the chapter). */
  hasTest: boolean;
  /** `dir`/`lang` for course-language text (chapter titles); the labels around them stay English. */
  contentDir?: { dir: "rtl"; lang: string };
};

const sub = "block rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg";

/**
 * Course → chapters → the current chapter's parts (slides, lessons, test). Always visible on large
 * screens; a collapsible panel below `lg`.
 */
export function ChapterSidebar({ courseSlug, courseTitle, chapters, currentSlug, hasTest, contentDir }: Props) {
  const [open, setOpen] = useState(false);
  const base = `/courses/${courseSlug}`;
  return (
    <aside aria-label="Course navigation" className="lg:sticky lg:top-6 lg:self-start">
      <Link href={base} className="text-sm font-semibold text-accent-soft hover:underline" {...contentDir}>
        {courseTitle}
      </Link>
      <p className="mt-1 text-xs text-subtle">
        {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
      </p>
      <Button
        variant="secondary"
        className="mt-3 w-full lg:hidden"
        aria-expanded={open}
        aria-controls="chapter-sidebar-list"
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon />
        {open ? "Hide chapters" : "Show chapters"}
      </Button>
      <nav id="chapter-sidebar-list" aria-label="Chapters" className={`mt-3 ${open ? "block" : "hidden"} lg:block`}>
        <ol className="flex flex-col gap-1">
          {chapters.map((chapter) => {
            const current = chapter.slug === currentSlug;
            return (
              <li key={chapter.slug}>
                <Link
                  href={`${base}/chapters/${chapter.slug}`}
                  aria-current={current ? "page" : undefined}
                  className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 aria-[current=page]:bg-surface-2 aria-[current=page]:text-accent-soft"
                >
                  <span className="text-xs text-subtle" dir="ltr">
                    {chapter.order}
                  </span>
                  <span className="min-w-0 flex-1" {...contentDir}>
                    {chapter.title}
                  </span>
                </Link>
                {current ? (
                  <ul aria-label={`Chapter ${chapter.order} sections`} className="ms-5 mt-1 flex flex-col gap-0.5 border-s border-line ps-2 text-sm">
                    <li>
                      <a href="#deck-heading" className={sub}>
                        Slides
                      </a>
                    </li>
                    <li>
                      <a href="#chapter-lessons-heading" className={sub}>
                        Lessons
                      </a>
                    </li>
                    {hasTest ? (
                      <li>
                        <Link href={`${base}/chapters/${chapter.slug}/test`} className={sub}>
                          Chapter test
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
