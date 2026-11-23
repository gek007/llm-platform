import { act, render, screen } from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import { describe, expect, test } from "vitest";
import { ChapterView, type ChapterData } from "./chapter-view";

const base: ChapterData = {
  course: { slug: "c", title: "Course", language: "en" },
  chapter: { _id: "ch1" as ChapterData["chapter"]["_id"], slug: "chapter-1", title: "First", summary: "About first", order: 1 },
  locked: false,
  deck: {
    slides: [
      { layout: "title", title: "Intro", bullets: ["Hi"], notes: "n1" },
      { layout: "bullets", title: "Points", bullets: ["A"], notes: "n2" },
    ],
  },
  lessons: [
    { slug: "l1", title: "Lesson one", locked: false },
    { slug: "l2", title: "Lesson two", locked: false },
  ],
  test: {
    _id: "t1" as NonNullable<ChapterData["test"]>["_id"],
    questionCount: 8,
    passPercent: 70,
    maxAttempts: 3,
    best: { scorePercent: 50, passed: false },
    attemptsUsed: 1,
  },
  prev: null,
  next: { slug: "chapter-2", title: "Second" },
};

describe("ChapterView", () => {
  test("renders the deck, lessons and the test card with best score and attempts", () => {
    render(<ChapterView data={base} signedIn />);
    expect(screen.getByRole("heading", { level: 1, name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "First slides" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Lesson two" })).toHaveAttribute("href", "/courses/c/lessons/l2");
    expect(screen.getByText(/Best score: 50%/)).toBeInTheDocument();
    expect(screen.getByText(/Attempts used: 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retake the test" })).toHaveAttribute(
      "href",
      "/courses/c/chapters/chapter-1/test",
    );
    expect(screen.getByRole("link", { name: /Second/ })).toHaveAttribute("href", "/courses/c/chapters/chapter-2");
  });

  test("a locked deck shows a sign-in prompt for signed-out visitors", () => {
    render(<ChapterView data={{ ...base, locked: true, deck: null }} signedIn={false} />);
    expect(screen.queryByRole("region", { name: "First slides" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Fcourses%2Fc%2Fchapters%2Fchapter-1",
    );
  });

  test("a locked deck for a signed-in viewer links to pricing", () => {
    render(<ChapterView data={{ ...base, locked: true, deck: null }} signedIn />);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
  });

  test("Hebrew chapters mark content containers rtl", () => {
    render(<ChapterView data={{ ...base, course: { ...base.course, language: "he" } }} signedIn />);
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("region", { name: "First slides" })).toHaveAttribute("lang", "he");
  });

  test("an agent can drive the deck inside the chapter view", async () => {
    const agent = createAgent();
    render(<ChapterView data={base} signedIn />);
    await act(async () => {
      const result = await agent.act({ steps: [{ ref: "Next", action: "press" }] });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});
