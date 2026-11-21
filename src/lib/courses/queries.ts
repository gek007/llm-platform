import { courses, lessons, users } from "./mock-data";
import type { Course, Id, Lesson, User } from "./types";

// Same names and shapes as the planned Convex queries, so call sites only change their import.

export function listPublishedCourses(): Course[] {
  return courses
    .filter((course) => course.status === "published")
    .sort((a, b) => b._creationTime - a._creationTime);
}

export function getPublishedCourseBySlug(slug: string): Course | null {
  return (
    courses.find(
      (course) => course.slug === slug && course.status === "published",
    ) ?? null
  );
}

export function listLessons(courseId: Id<"courses">): Lesson[] {
  return lessons
    .filter((lesson) => lesson.courseId === courseId)
    .sort((a, b) => a.order - b.order);
}

export function getLessonBySlug(
  courseId: Id<"courses">,
  slug: string,
): Lesson | null {
  return (
    lessons.find(
      (lesson) => lesson.courseId === courseId && lesson.slug === slug,
    ) ?? null
  );
}

export function getUser(userId: Id<"users">): User | null {
  return users.find((user) => user._id === userId) ?? null;
}

export function getCourseDurationMinutes(courseId: Id<"courses">): number {
  return listLessons(courseId).reduce(
    (total, lesson) => total + lesson.durationMinutes,
    0,
  );
}
