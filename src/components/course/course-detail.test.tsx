import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CourseDetail } from "./course-detail";

const data: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: { name: string }) => data[ref.name],
  useMutation: () => vi.fn(),
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    courses: { getBySlug: { name: "getBySlug" } },
    viewer: { get: { name: "viewer" } },
    progress: { forCourse: { name: "forCourse" } },
    enrollments: { isEnrolled: { name: "isEnrolled" }, enroll: { name: "enroll" } },
  },
}));

const lesson = (n: number) => ({
  _id: `l${n}`,
  slug: `lesson-${n}`,
  title: `Lesson ${n}`,
  summary: "",
  order: n,
  durationMinutes: 10,
  isFreePreview: false,
  hasVideo: false,
  locked: false,
});
const chapter = (n: number, lessonIds: string[], hasDeck = true) => ({
  _id: `c${n}`,
  slug: `chapter-${n}`,
  title: `Chapter ${n}`,
  summary: "",
  order: n,
  lessonIds,
  hasDeck,
  test: null,
});
const course = {
  _id: "course1",
  slug: "mcp",
  title: "MCP servers",
  summary: "About MCP.",
  description: "Long description.",
  level: "beginner",
  tier: "free",
  language: "en",
  outcomes: [],
  lessons: [1, 2, 3, 4].map(lesson),
  chapters: [chapter(1, ["l1", "l2"]), chapter(2, ["l3", "l4"])],
};

const continueLink = () => screen.getByRole("link", { name: "Continue" });

beforeEach(() => {
  data.getBySlug = course;
  data.viewer = { signedIn: true, isPro: false, isAdmin: false };
  data.isEnrolled = true;
  data.forCourse = [];
});

describe("CourseDetail: slides first", () => {
  test("a learner who has not started is sent to the first chapter's slides", () => {
    render(<CourseDetail slug="mcp" />);
    expect(continueLink()).toHaveAttribute("href", "/courses/mcp/chapters/chapter-1");
  });

  test("mid-chapter, Continue goes to the next lesson", () => {
    data.forCourse = ["l1"];
    render(<CourseDetail slug="mcp" />);
    expect(continueLink()).toHaveAttribute("href", "/courses/mcp/lessons/lesson-2");
  });

  test("after a chapter's last lesson, Continue opens the next chapter's slides", () => {
    data.forCourse = ["l1", "l2"];
    render(<CourseDetail slug="mcp" />);
    expect(continueLink()).toHaveAttribute("href", "/courses/mcp/chapters/chapter-2");
  });

  test("a chapter without a deck is entered at its lesson", () => {
    data.getBySlug = { ...course, chapters: [chapter(1, ["l1", "l2"], false), chapter(2, ["l3", "l4"])] };
    render(<CourseDetail slug="mcp" />);
    expect(continueLink()).toHaveAttribute("href", "/courses/mcp/lessons/lesson-1");
  });

  test("the outline is headed Chapters and each chapter starts with its slides link", () => {
    render(<CourseDetail slug="mcp" />);
    expect(screen.getByRole("heading", { level: 2, name: "Chapters" })).toBeInTheDocument();
    const first = screen.getByRole("region", { name: "Chapter 1" });
    expect(within(first).getByRole("link", { name: "Slides: Chapter 1" })).toHaveAttribute(
      "href",
      "/courses/mcp/chapters/chapter-1#deck-heading",
    );
  });

  test("a course without chapters keeps the Lessons heading and goes to the lesson", () => {
    data.getBySlug = { ...course, chapters: [] };
    render(<CourseDetail slug="mcp" />);
    expect(screen.getByRole("heading", { level: 2, name: "Lessons" })).toBeInTheDocument();
    expect(continueLink()).toHaveAttribute("href", "/courses/mcp/lessons/lesson-1");
  });
});
