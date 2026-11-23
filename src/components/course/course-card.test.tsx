import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CourseCard, type CourseCardData } from "./course-card";

const course: CourseCardData = {
  slug: "c",
  title: "Course",
  summary: "s",
  level: "beginner",
  tier: "free",
  lessonCount: 2,
  completedCount: 2,
  continueHref: "/courses/c",
};

describe("CourseCard", () => {
  test("shows Complete only when the course is complete", () => {
    const { rerender } = render(<CourseCard course={course} />);
    expect(screen.queryByText("Complete")).toBeNull();
    rerender(<CourseCard course={{ ...course, complete: true }} />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });
});
