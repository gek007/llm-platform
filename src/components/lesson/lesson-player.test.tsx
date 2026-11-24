import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { OutlineChapter, OutlineLesson } from "@/components/course/lesson-outline";
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

  describe("in a chaptered course: slides first", () => {
    const three: OutlineLesson[] = [...outline, { _id: "l3", slug: "three", title: "Three", order: 3, durationMinutes: 10, isFreePreview: false, hasVideo: false, locked: false }];
    const chapters: OutlineChapter[] = [
      { _id: "c1", slug: "chapter-1", title: "Basics", summary: "", order: 1, lessonIds: ["l1", "l2"], hasDeck: true, test: null },
      { _id: "c2", slug: "chapter-2", title: "Advanced", summary: "", order: 2, lessonIds: ["l3"], hasDeck: true, test: null },
    ];
    const at = (id: string, slug: string, next: LessonData["next"]): LessonData => {
      const base = data({ locked: false });
      return { ...base, lesson: { ...base.lesson, _id: id, slug }, next } as unknown as LessonData;
    };

    test("the lesson names its chapter and links to the chapter's slides", () => {
      render(<LessonPlayer data={data({ locked: false })} outline={three} chapters={chapters} completedIds={[]} signedIn />);
      const header = screen.getByRole("heading", { level: 1, name: "One" }).closest("header")!;
      expect(within(header).getByRole("link", { name: "Chapter 1: Basics" })).toHaveAttribute("href", "/courses/c/chapters/chapter-1");
      expect(within(header).getByRole("link", { name: "Chapter slides" })).toHaveAttribute(
        "href",
        "/courses/c/chapters/chapter-1#deck-heading",
      );
    });

    test("the sidebar groups lessons by chapter, each starting with its slides", () => {
      render(<LessonPlayer data={data({ locked: false })} outline={three} chapters={chapters} completedIds={[]} signedIn />);
      const sidebar = screen.getByRole("complementary", { name: "Course outline" });
      expect(within(sidebar).getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Basics", "Advanced"]);
      expect(within(sidebar).getByRole("link", { name: "Slides: Basics" })).toHaveTextContent("This chapter");
      expect(within(sidebar).getByRole("link", { name: "Slides: Advanced" })).toHaveAttribute(
        "href",
        "/courses/c/chapters/chapter-2#deck-heading",
      );
      expect(within(sidebar).getByText("0 of 3 completed")).toBeInTheDocument();
    });

    test("Next within a chapter goes to the next lesson", () => {
      render(<LessonPlayer data={data({ locked: false })} outline={three} chapters={chapters} completedIds={[]} signedIn />);
      const nav = screen.getByRole("navigation", { name: "Lesson navigation" });
      expect(within(nav).getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/courses/c/lessons/two");
    });

    test("Next from a chapter's last lesson opens the next chapter's slides", () => {
      render(
        <LessonPlayer
          data={at("l2", "two", { slug: "three", title: "Three", locked: false })}
          outline={three}
          chapters={chapters}
          completedIds={[]}
          signedIn
        />,
      );
      const nav = screen.getByRole("navigation", { name: "Lesson navigation" });
      const next = within(nav).getByRole("link", { name: /Next: chapter 2 slides/ });
      expect(next).toHaveAttribute("href", "/courses/c/chapters/chapter-2#deck-heading");
      expect(next).toHaveTextContent("Advanced");
    });

    test("a next chapter without slides is entered at its first lesson", () => {
      const noDeck = [chapters[0], { ...chapters[1], hasDeck: false }];
      render(
        <LessonPlayer
          data={at("l2", "two", { slug: "three", title: "Three", locked: false })}
          outline={three}
          chapters={noDeck}
          completedIds={[]}
          signedIn
        />,
      );
      const nav = screen.getByRole("navigation", { name: "Lesson navigation" });
      expect(within(nav).getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/courses/c/lessons/three");
    });

    test("a course without chapters shows no chapter line", () => {
      render(<LessonPlayer data={data({ locked: false })} outline={outline} completedIds={[]} signedIn />);
      expect(screen.queryByRole("link", { name: "Chapter slides" })).toBeNull();
    });
  });

  test("tolerates an older backend that returns no sources or language", () => {
    const legacy: Record<string, unknown> = { ...data({ locked: false }) };
    delete legacy.sources;
    delete legacy.language;
    const { container } = render(
      <LessonPlayer data={legacy as unknown as LessonData} outline={outline} completedIds={[]} signedIn />,
    );
    expect(screen.getByRole("heading", { name: "Secret body" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /sources/i })).toBeNull();
    expect(container.querySelector('[dir="rtl"]')).toBeNull();
  });
});
