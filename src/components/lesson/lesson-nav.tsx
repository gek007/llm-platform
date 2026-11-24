import Link from "next/link";
import { lessonHref } from "@/components/course/format";
import { ArrowIcon, LockIcon } from "@/components/course/icons";

/**
 * A neighbouring lesson, or (with `href` and `kicker`) another destination in its place: the next
 * chapter's slides when the next lesson starts a new chapter.
 */
export type NavTarget = { slug: string; title: string; locked: boolean; href?: string; kicker?: string };
type Ref = NavTarget | null;

function NavLink({ courseSlug, target, dir }: { courseSlug: string; target: NavTarget; dir: "prev" | "next" }) {
  return (
    <Link
      href={target.href ?? lessonHref(courseSlug, target.slug)}
      rel={dir}
      className={`group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent ${dir === "next" ? "flex-row-reverse text-right" : ""}`}
    >
      <ArrowIcon direction={dir === "next" ? "right" : "left"} className="shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-widest text-subtle">
          {target.kicker ?? (dir === "next" ? "Next" : "Previous")}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate" dir="auto">
            {target.title}
          </span>
          {target.locked ? (
            <span role="img" aria-label="Locked" className="text-subtle">
              <LockIcon width={14} height={14} />
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export function LessonNav({ courseSlug, prev, next }: { courseSlug: string; prev: Ref; next: Ref }) {
  return (
    <nav aria-label="Lesson navigation" className="mt-10 flex flex-col gap-3 sm:flex-row">
      {prev ? <NavLink courseSlug={courseSlug} target={prev} dir="prev" /> : <span className="flex-1" />}
      {next ? <NavLink courseSlug={courseSlug} target={next} dir="next" /> : <span className="flex-1" />}
    </nav>
  );
}
