import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ChapterView, type ChapterData } from "./chapter-view";
import { Slide } from "./slide";

vi.mock("./slide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./slide")>();
  return { ...actual, Slide: vi.fn(actual.Slide) };
});

const jobId = "job1" as NonNullable<ChapterData["generation"]>["jobId"];
const chapterId = "ch1" as ChapterData["chapter"]["_id"];

const base: ChapterData = {
  course: { slug: "c", title: "Course", language: "en" },
  chapters: [
    { slug: "chapter-1", title: "First", order: 1, hasDeck: true },
    { slug: "chapter-2", title: "Second", order: 2, hasDeck: false },
  ],
  generation: null,
  chapter: { _id: chapterId, slug: "chapter-1", title: "First", summary: "About first", order: 1 },
  locked: false,
  deck: {
    chapterId,
    title: "First",
    updatedAt: 1,
    slides: [
      { id: "s1", layout: "title", title: "Intro", bullets: ["Hi"], notes: "n1" },
      { id: "s2", layout: "bullets", title: "Points", bullets: ["A"], notes: "n2" },
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

const noDeck = (generation: ChapterData["generation"]): ChapterData => ({ ...base, deck: null, generation });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChapterView", () => {
  test("renders the deck, lessons and the test card with best score and attempts", () => {
    render(<ChapterView data={base} signedIn />);
    expect(screen.getByRole("heading", { level: 1, name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "First slides" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Chapter lessons" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Lesson two" })).toHaveAttribute("href", "/courses/c/lessons/l2");
    expect(screen.getByText(/Best score: 50%/)).toBeInTheDocument();
    expect(screen.getByText(/Attempts used: 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retake the test" })).toHaveAttribute(
      "href",
      "/courses/c/chapters/chapter-1/test",
    );
    const footer = screen.getByRole("navigation", { name: "Chapter navigation" });
    expect(within(footer).getByRole("link", { name: /Second/ })).toHaveAttribute("href", "/courses/c/chapters/chapter-2");
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

describe("chapter sidebar: course → chapters → the chapter's parts", () => {
  test("links the course and every chapter, marks the current one and lists its sections", () => {
    render(<ChapterView data={base} signedIn />);
    const sidebar = screen.getByRole("complementary", { name: "Course navigation" });
    expect(within(sidebar).getByRole("link", { name: "Course" })).toHaveAttribute("href", "/courses/c");
    const chapters = within(sidebar).getByRole("navigation", { name: "Chapters" });
    const first = within(chapters).getByRole("link", { name: /First$/ });
    expect(first).toHaveAttribute("href", "/courses/c/chapters/chapter-1");
    expect(first).toHaveAttribute("aria-current", "page");
    const second = within(chapters).getByRole("link", { name: /Second$/ });
    expect(second).toHaveAttribute("href", "/courses/c/chapters/chapter-2");
    expect(second).not.toHaveAttribute("aria-current");

    const sections = within(chapters).getByRole("list", { name: "Chapter 1 sections" });
    expect(within(sections).getByRole("link", { name: "Slides" })).toHaveAttribute("href", "#deck-heading");
    expect(within(sections).getByRole("link", { name: "Lessons" })).toHaveAttribute("href", "#chapter-lessons-heading");
    expect(within(sections).getByRole("link", { name: "Chapter test" })).toHaveAttribute("href", "/courses/c/chapters/chapter-1/test");
    // The anchors exist on the page.
    expect(document.getElementById("deck-heading")).not.toBeNull();
    expect(document.getElementById("chapter-lessons-heading")).not.toBeNull();
  });

  test("a chapter without a test has no test link; the chapter list collapses on small screens", async () => {
    const user = userEvent.setup();
    render(<ChapterView data={{ ...base, test: null }} signedIn />);
    expect(screen.queryByRole("link", { name: "Chapter test" })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show chapters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide chapters" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("a chapter without a deck", () => {
  test("a hand-made or older chapter falls back to its lessons, the text view", () => {
    render(<ChapterView data={noDeck(null)} signedIn />);
    expect(screen.getByText("No slides for this chapter yet. Its lessons below cover the material.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lesson one" })).toBeInTheDocument();
  });

  test("while the course is being written an admin sees the loading skeleton", () => {
    render(<ChapterView data={noDeck({ jobId, status: "writing", error: null })} signedIn />);
    expect(screen.getByRole("status", { name: "Generating slides" })).toBeInTheDocument();
    expect(screen.getByText(/Generating slides for this chapter/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a failed generation shows the error and links to the job, where it is retried", () => {
    render(<ChapterView data={noDeck({ jobId, status: "failed", error: "No progress for 15 minutes" })} signedIn />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Slide generation failed");
    expect(alert).toHaveTextContent("No progress for 15 minutes");
    expect(within(alert).getByRole("link", { name: "Open the generation job" })).toHaveAttribute("href", "/admin/generate/job1");
    // A failed job cannot take a regenerate: no button that would only be refused.
    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
  });

  test("a finished generation without a deck offers Regenerate, which asks the engine for this chapter's deck", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChapterView data={noDeck({ jobId, status: "ready", error: null })} signedIn />);
    expect(screen.getByRole("alert")).toHaveTextContent("This chapter has no slides");
    await user.click(screen.getByRole("button", { name: "Regenerate chapter slides" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/course-builder/regenerate");
    expect(JSON.parse(init.body as string)).toEqual({
      jobId: "job1",
      target: { kind: "deck", chapterOrder: 1 },
      instruction: "Rebuild the slide deck: the saved one is missing or could not be displayed.",
    });
    expect(screen.queryByText(/could not be reached/)).not.toBeInTheDocument();
  });

  test("a refused regenerate shows why", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Unpublish the course to regenerate" }), { status: 409 })),
    );
    render(<ChapterView data={noDeck({ jobId, status: "ready", error: null })} signedIn />);
    await user.click(screen.getByRole("button", { name: "Regenerate chapter slides" }));
    expect(await screen.findByText("Unpublish the course to regenerate")).toBeInTheDocument();
  });
});

describe("a deck that cannot be rendered", () => {
  test("shows the error state instead of breaking the page, with Regenerate for an admin", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Slide).mockImplementation(() => {
      throw new Error("cannot draw this slide");
    });
    render(<ChapterView data={{ ...base, generation: { jobId, status: "ready", error: null } }} signedIn />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("These slides could not be displayed");
    expect(within(alert).getByRole("button", { name: "Regenerate chapter slides" })).toBeInTheDocument();
    // The rest of the chapter is still there.
    expect(screen.getByRole("heading", { level: 1, name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lesson one" })).toBeInTheDocument();
  });

  test("a learner gets the same error without admin controls", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Slide).mockImplementation(() => {
      throw new Error("cannot draw this slide");
    });
    render(<ChapterView data={base} signedIn />);
    expect(screen.getByRole("alert")).toHaveTextContent("The lessons below still cover this chapter.");
    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the generation job" })).not.toBeInTheDocument();
  });
});
