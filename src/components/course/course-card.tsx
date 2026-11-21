import Link from "next/link";
import { formatDuration } from "@/components/course/format";
import { LevelBadge, TierBadge } from "./badges";
import { BookIcon, ClockIcon } from "./icons";
import { ProgressBar } from "./progress-bar";

export type CourseCardData = {
  slug: string;
  title: string;
  summary: string;
  level: "beginner" | "intermediate" | "advanced";
  tier: "free" | "pro";
  lessonCount: number;
  durationMinutes?: number;
  previewCount?: number;
  /** Set on dashboard cards: shows progress and a Continue link. */
  completedCount?: number;
  continueHref?: string | null;
};

export function CourseCard({ course }: { course: CourseCardData }) {
  const isDashboard = course.completedCount !== undefined;
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift">
      <div className="flex items-center gap-2">
        <TierBadge tier={course.tier} />
        <LevelBadge level={course.level} />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold leading-snug">
        <Link
          href={`/courses/${course.slug}`}
          className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-accent"
        >
          {course.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{course.summary}</p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <li className="flex items-center gap-1.5">
          <BookIcon width={14} height={14} />
          {course.lessonCount} lessons
        </li>
        {course.durationMinutes !== undefined ? (
          <li className="flex items-center gap-1.5">
            <ClockIcon width={14} height={14} />
            {formatDuration(course.durationMinutes)}
          </li>
        ) : null}
        {course.previewCount ? (
          <li className="text-accent-soft">
            {course.previewCount} free {course.previewCount === 1 ? "preview" : "previews"}
          </li>
        ) : null}
      </ul>
      {isDashboard ? (
        <div className="mt-4">
          <ProgressBar
            done={course.completedCount ?? 0}
            total={course.lessonCount}
            label={`${course.title} progress`}
          />
          {course.continueHref ? (
            <Link
              href={course.continueHref}
              className="relative z-10 mt-4 inline-flex w-full items-center justify-center rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-soft hover:bg-accent-soft"
            >
              {course.completedCount ? "Continue" : "Start"}
              <span className="sr-only">: {course.title}</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
