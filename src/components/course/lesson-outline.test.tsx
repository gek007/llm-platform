import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { LessonOutline, type OutlineLesson } from "./lesson-outline";

const lessons: OutlineLesson[] = [
  { _id: "l1", slug: "intro", title: "Intro", order: 1, durationMinutes: 10, isFreePreview: true, hasVideo: true, locked: false },
  { _id: "l2", slug: "deep", title: "Deep dive", order: 2, durationMinutes: 75, isFreePreview: false, hasVideo: false, locked: true },
  { _id: "l3", slug: "done", title: "Done one", order: 3, durationMinutes: 5, isFreePreview: false, hasVideo: false, locked: false },
];

describe("LessonOutline", () => {
  test("renders preview, video, locked and completed states", () => {
    render(<LessonOutline courseSlug="c" lessons={lessons} completedIds={["l3"]} currentSlug="intro" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    expect(within(items[0]).getByText("Free preview")).toBeInTheDocument();
    expect(within(items[0]).getByText("Video")).toBeInTheDocument();
    expect(within(items[0]).queryByRole("img", { name: "Locked" })).toBeNull();
    expect(within(items[0]).getByRole("link")).toHaveAttribute("aria-current", "page");

    expect(within(items[1]).getByRole("img", { name: "Locked" })).toBeInTheDocument();
    expect(within(items[1]).getByText("1h 15m")).toBeInTheDocument();
    expect(within(items[1]).getByRole("link")).toHaveAttribute("href", "/courses/c/lessons/deep");

    expect(within(items[2]).getByText(/Completed:/)).toBeInTheDocument();
    expect(within(items[1]).queryByText(/Completed:/)).toBeNull();
  });
});
