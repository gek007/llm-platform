import { fetchQuery } from "convex/nextjs";
import { cacheLife } from "next/cache";
import { api } from "../../../convex/_generated/api";
import { CourseCard, type CourseCardData } from "./course-card";
import { Reveal } from "./reveal";

/** Cached so the landing page's static shell includes the catalog. Errors throw, so failures are never cached. */
async function loadPublishedCourses(): Promise<CourseCardData[]> {
  "use cache";
  cacheLife("minutes");
  return fetchQuery(api.courses.listPublished, {});
}

/** Server component: live catalog from Convex. Render inside <Suspense>. */
export async function CourseCatalog() {
  let courses: CourseCardData[] = [];
  let failed = false;
  try {
    courses = await loadPublishedCourses();
  } catch (error) {
    console.error("Could not load the course catalog", error);
    failed = true;
  }

  if (courses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-muted">
        {failed ? "Courses are unavailable right now. Please try again shortly." : "New courses are on the way."}
      </p>
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course, i) => (
        <li key={course.slug}>
          <Reveal delay={Math.min(i, 5) * 0.07} className="h-full">
            <CourseCard course={course} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

export function CourseCatalogSkeleton() {
  return (
    <ul aria-busy="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-56 animate-pulse-soft rounded-xl border border-line bg-surface" />
      ))}
    </ul>
  );
}
