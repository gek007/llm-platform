import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CourseCatalog } from "./course-catalog";
import { DashboardCourses } from "./dashboard-courses";

const useQuery = vi.fn();
vi.mock("convex/react", () => ({ useQuery: (...a: unknown[]) => useQuery(...a) }));

const course = {
  _id: "c1",
  slug: "react-server-components",
  title: "React Server Components",
  summary: "Learn RSC.",
  level: "advanced",
  tier: "pro",
  lessonCount: 4,
  durationMinutes: 90,
  previewCount: 1,
};

beforeEach(() => useQuery.mockReset());

describe("CourseCatalog", () => {
  test("shows a loading state", () => {
    useQuery.mockReturnValue(undefined);
    render(<CourseCatalog />);
    expect(screen.getByLabelText("Loading courses")).toBeInTheDocument();
  });

  test("renders course cards with badges and totals", () => {
    useQuery.mockReturnValue([course]);
    render(<CourseCatalog />);
    expect(screen.getByRole("link", { name: "React Server Components" })).toHaveAttribute(
      "href",
      "/courses/react-server-components",
    );
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("4 lessons")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("1 free preview")).toBeInTheDocument();
  });
});

describe("DashboardCourses", () => {
  test("empty state links to the catalog", () => {
    useQuery.mockReturnValue([]);
    render(<DashboardCourses />);
    expect(screen.getByRole("link", { name: "Browse courses" })).toHaveAttribute("href", "/courses");
  });

  test("shows progress and a Continue link to the next lesson", () => {
    useQuery.mockReturnValue([{ ...course, completedCount: 1, nextLessonSlug: "the-client-boundary" }]);
    render(<DashboardCourses />);
    expect(screen.getByRole("progressbar", { name: /progress/ })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("link", { name: /Continue/ })).toHaveAttribute(
      "href",
      "/courses/react-server-components/lessons/the-client-boundary",
    );
  });
});
