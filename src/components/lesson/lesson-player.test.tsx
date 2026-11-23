import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { OutlineLesson } from "@/components/course/lesson-outline";
import { LessonPlayer, type LessonData } from "./lesson-player";

vi.mock("convex/react", () => ({
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return vi.fn(); } }),
}));
vi.mock("@/components/video/lesson-video", () => ({
  LessonVideo: ({ lessonId, title }: { lessonId: string; title: string }) => (
    <div data-testid="video" data-lesson={lessonId} data-title={title} />
  ),
}));

const outline: OutlineLesson[] = [
  { _id: "l1", slug: "one", title: "One", order: 1, durationMinutes: 10, isFreePreview: true, hasVideo: true, locked: false },
  { _id: "l2", slug: "two", title: "Two", order: 2, durationMinutes: 10, isFreePreview: false, hasVideo: false, locked: true },
];

function data(over: { locked: boolean; tier?: "free" | "pro"; withVideo?: boolean }): LessonData {
  const base = { _id: "l1", slug: "one", title: "One", summary: "Intro summary", order: 1, durationMinutes: 10, isFreePreview: true, hasVideo: over.withVideo ?? false };
  return {
    course: { _id: "c1", slug: "c", title: "Course", tier: over.tier ?? "pro" },
    language: "en",
    chapter: null,
    sources: [],
    lesson: over.locked ? base : { ...base, body: "## Secret body\n\nHello **world**" },
    locked: over.locked,
    prev: null,
    next: { slug: "two", title: "Two", locked: true },
  } as unknown as LessonData;
}

describe("LessonPlayer", () => {
  test("unlocked lesson shows body, video, toggle and slug attributes", () => {
    const { container } = render(
      <LessonPlayer data={data({ locked: false, withVideo: true })} outline={outline} completedIds={[]} signedIn />,
    );
    expect(screen.getByRole("heading", { name: "Secret body" })).toBeInTheDocument();
    expect(screen.getByTestId("video")).toHaveAttribute("data-lesson", "l1");
    expect(screen.getByRole("button", { name: "Mark as complete" })).toBeInTheDocument();
    const root = container.querySelector("[data-course-slug]");
    expect(root).toHaveAttribute("data-course-slug", "c");
    expect(root).toHaveAttribute("data-lesson-slug", "one");
  });

  test("locked lesson shows the upgrade card and never the body", () => {
    render(<LessonPlayer data={data({ locked: true })} outline={outline} completedIds={[]} signedIn />);
    expect(screen.queryByText("Secret body")).toBeNull();
    expect(screen.queryByTestId("video")).toBeNull();
    expect(screen.queryByRole("button", { name: /complete/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
  });

  test("locked and signed out shows a sign-in card", () => {
    render(<LessonPlayer data={data({ locked: true })} outline={outline} completedIds={[]} signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/sign-in"));
    expect(screen.queryByText("Secret body")).toBeNull();
  });

  test("renders prev/next and sidebar with completion; sidebar toggles", async () => {
    render(<LessonPlayer data={data({ locked: false })} outline={outline} completedIds={["l1"]} signedIn />);
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/courses/c/lessons/two");
    expect(screen.getByText("1 of 2 completed")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show lessons" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(toggle);
    expect(screen.getByRole("button", { name: "Hide lessons" })).toHaveAttribute("aria-expanded", "true");
  });
});
