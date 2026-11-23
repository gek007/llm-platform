import Link from "next/link";
import { formatDuration, lessonHref } from "@/components/course/format";
import { PreviewBadge } from "./badges";
import { CheckIcon, LockIcon, VideoIcon } from "./icons";

export type OutlineLesson = {
  _id: string;
  slug: string;
  title: string;
  summary?: string;
  order: number;
  durationMinutes: number;
  isFreePreview: boolean;
  hasVideo: boolean;
  locked: boolean;
};

export type OutlineChapter = {
  _id: string;
  slug: string;
  title: string;
  summary: string;
  order: number;
  lessonIds: readonly string[];
  hasDeck: boolean;
  test: { _id: string; questionCount: number } | null;
};

type Props = {
  chapters?: OutlineChapter[];
  courseSlug: string;
  lessons: OutlineLesson[];
  completedIds: readonly string[];
  currentSlug?: string;
  /** Compact style for the lesson sidebar. */
  compact?: boolean;
  label?: string;
};

export function LessonOutline({ courseSlug, lessons, completedIds, currentSlug, compact, label = "Lessons", chapters }: Props) {
  const done = new Set(completedIds);
  if (chapters && chapters.length > 0) {
    return (
      <div aria-label={label} role="group" className="space-y-4">
        {chapters.map((chapter) => {
          const chapterLessons = lessons.filter((l) => chapter.lessonIds.includes(l._id));
          const chapterHref = `/courses/${courseSlug}/chapters/${chapter.slug}`;
          return (
            <section
              key={chapter._id}
              aria-label={chapter.title}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <header className="border-b border-line bg-surface-2 px-4 py-3">
                <h3 className="font-display text-base font-semibold" dir="auto">
                  <Link href={chapterHref} className="hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                    {chapter.order}. {chapter.title}
                  </Link>
                </h3>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-subtle">
                  {chapter.hasDeck ? <span>Slides</span> : null}
                  <span>
                    {chapterLessons.length} {chapterLessons.length === 1 ? "lesson" : "lessons"}
                  </span>
                  {chapter.test ? <span>Test ({chapter.test.questionCount} questions)</span> : null}
                </p>
              </header>
              <Rows
                courseSlug={courseSlug}
                lessons={chapterLessons}
                done={done}
                currentSlug={currentSlug}
                compact={compact}
                label={`${chapter.title} lessons`}
                bare
              />
              {chapter.test ? (
                <Link
                  href={`${chapterHref}/test`}
                  className="block border-t border-line px-4 py-3 text-sm font-medium text-accent hover:bg-surface-2"
                >
                  Chapter test
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  }
  return <Rows courseSlug={courseSlug} lessons={lessons} done={done} currentSlug={currentSlug} compact={compact} label={label} />;
}

function Rows({
  courseSlug,
  lessons,
  done,
  currentSlug,
  compact,
  label,
  bare,
}: {
  courseSlug: string;
  lessons: OutlineLesson[];
  done: Set<string>;
  currentSlug?: string;
  compact?: boolean;
  label: string;
  bare?: boolean;
}) {
  return (
    <ol
      aria-label={label}
      className={`divide-y divide-line ${bare ? "" : "overflow-hidden rounded-xl border border-line bg-surface"}`}
    >
      {lessons.map((lesson, index) => {
        const completed = done.has(lesson._id);
        const current = lesson.slug === currentSlug;
        return (
          <li key={lesson._id}>
            <Link
              href={lessonHref(courseSlug, lesson.slug)}
              aria-current={current ? "page" : undefined}
              className={`flex items-start gap-3 px-4 ${compact ? "py-2.5" : "py-3.5"} transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${current ? "bg-surface-2" : ""}`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${completed ? "bg-success/15 text-success" : "bg-surface-3 text-muted"}`}
              >
                {completed ? (
                  <>
                    <CheckIcon width={14} height={14} />
                    <span className="sr-only">Completed: </span>
                  </>
                ) : (
                  lesson.order || index + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{lesson.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                  <span>{formatDuration(lesson.durationMinutes)}</span>
                  {lesson.hasVideo ? (
                    <span className="inline-flex items-center gap-1">
                      <VideoIcon width={13} height={13} />
                      Video
                    </span>
                  ) : null}
                  {lesson.isFreePreview ? <PreviewBadge /> : null}
                </span>
              </span>
              {lesson.locked ? (
                <span className="mt-1 text-subtle" role="img" aria-label="Locked">
                  <LockIcon />
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
