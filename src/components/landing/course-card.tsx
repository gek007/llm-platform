import Link from "next/link";
import { cn } from "@/lib/utils";

export type CourseCardData = {
  slug: string;
  title: string;
  summary: string;
  level: "beginner" | "intermediate" | "advanced";
  tier: "free" | "pro";
  lessonCount: number;
  durationMinutes: number;
};

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function CourseCard({ course }: { course: CourseCardData }) {
  const pro = course.tier === "pro";
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-6 shadow-soft transition-all hover:-translate-y-1 hover:border-accent/50 hover:shadow-glow"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
            pro ? "bg-iris/20 text-iris-soft" : "bg-success/15 text-success",
          )}
        >
          {pro ? "Pro" : "Free"}
        </span>
        <span className="text-xs capitalize text-muted">{course.level}</span>
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold leading-snug group-hover:text-accent-soft">
        {course.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{course.summary}</p>
      <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-subtle">
        <span>
          {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"}
        </span>
        <span aria-hidden="true">·</span>
        <span>{formatDuration(course.durationMinutes)}</span>
        <span aria-hidden="true" className="ml-auto text-accent transition-transform group-hover:translate-x-1">
          →
        </span>
      </p>
    </Link>
  );
}
