import { describe, expect, test } from "vitest";
import { courses, lessons, users } from "./mock-data";
import {
  getCourseDurationMinutes,
  getLessonBySlug,
  getPublishedCourseBySlug,
  getUser,
  listLessons,
  listPublishedCourses,
} from "./queries";

const typescript = courses.find((c) => c.slug === "typescript-foundations")!;

describe("listPublishedCourses", () => {
  test("returns only published courses, newest first", () => {
    const result = listPublishedCourses();
    expect(result.map((c) => c.slug)).toEqual([
      "web-accessibility",
      "typescript-foundations",
    ]);
    expect(result.every((c) => c.status === "published")).toBe(true);
  });

  test("does not reorder the source data", () => {
    const before = courses.map((c) => c.slug);
    listPublishedCourses();
    expect(courses.map((c) => c.slug)).toEqual(before);
  });
});

describe("getPublishedCourseBySlug", () => {
  test("finds a published course", () => {
    expect(getPublishedCourseBySlug("typescript-foundations")?.title).toBe(
      "TypeScript Foundations",
    );
  });

  test("hides drafts and unknown slugs", () => {
    expect(getPublishedCourseBySlug("realtime-backends")).toBeNull();
    expect(getPublishedCourseBySlug("missing")).toBeNull();
  });
});

describe("lessons", () => {
  test("lists a course's lessons in order", () => {
    expect(listLessons(typescript._id).map((l) => l.order)).toEqual([1, 2, 3, 4]);
  });

  test("finds a lesson only within its own course", () => {
    expect(getLessonBySlug(typescript._id, "basic-types")?.title).toBe(
      "Basic types",
    );
    expect(getLessonBySlug(typescript._id, "keyboard-first")).toBeNull();
  });

  test("sums a course's duration", () => {
    expect(getCourseDurationMinutes(typescript._id)).toBe(8 + 15 + 12 + 10);
  });
});

describe("getUser", () => {
  test("resolves a course instructor", () => {
    expect(getUser(typescript.instructorId)?.name).toBe("Ada Okafor");
  });
});

describe("mock data integrity", () => {
  test("ids and slugs are unique", () => {
    const ids = [...users, ...courses, ...lessons].map((doc) => doc._id);
    expect(new Set(ids).size).toBe(ids.length);
    const courseSlugs = courses.map((c) => c.slug);
    expect(new Set(courseSlugs).size).toBe(courseSlugs.length);
  });

  test("every reference points at an existing document", () => {
    const courseIds = new Set(courses.map((c) => c._id));
    const instructorIds = new Set(
      users.filter((u) => u.role === "instructor").map((u) => u._id),
    );
    for (const lesson of lessons) expect(courseIds).toContain(lesson.courseId);
    for (const course of courses) expect(instructorIds).toContain(course.instructorId);
  });

  test("lesson slugs are unique and orders run 1..n within each course", () => {
    for (const course of courses) {
      const own = listLessons(course._id);
      expect(own.map((l) => l.order)).toEqual(own.map((_, i) => i + 1));
      expect(new Set(own.map((l) => l.slug)).size).toBe(own.length);
    }
  });
});
