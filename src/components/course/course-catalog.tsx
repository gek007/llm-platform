"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CourseCard } from "./course-card";

export function CourseCatalog() {
  const courses = useQuery(api.courses.listPublished);

  if (courses === undefined) return <CatalogSkeleton />;
  if (courses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-muted">
        No courses are published yet. Check back soon.
      </p>
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <li key={course._id}>
          <CourseCard course={course} />
        </li>
      ))}
    </ul>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading courses">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </div>
  );
}
