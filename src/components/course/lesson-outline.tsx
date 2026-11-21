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

type Props = {
  courseSlug: string;
  lessons: OutlineLesson[];
  completedIds: readonly string[];
  currentSlug?: string;
  /** Compact style for the lesson sidebar. */
  compact?: boolean;
  label?: string;
};

export function LessonOutline({ courseSlug, lessons, completedIds, currentSlug, compact, label = "Lessons" }: Props) {
  const done = new Set(completedIds);
  return (
    <ol aria-label={label} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
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
