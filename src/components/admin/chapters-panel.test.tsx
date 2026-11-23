import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ChaptersPanel } from "./chapters-panel";

const updateChapter = vi.fn();
const data: Record<string, unknown> = {};
vi.mock("@/components/admin/use-admin-query", () => ({
  useAdminQuery: (ref: { name: string }) => data[ref.name],
}));
vi.mock("convex/react", () => ({ useMutation: () => updateChapter }));
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    admin: { updateChapter: { name: "updateChapter" }, getDeck: { name: "getDeck" }, updateDeck: { name: "updateDeck" }, getTest: { name: "getTest" }, updateTest: { name: "updateTest" } },
    generation: { get: { name: "get" }, events: { name: "events" } },
  },
}));

const chapters = [
  {
    _id: "ch1",
    slug: "chapter-1",
    title: "Basics",
    summary: "Start here",
    order: 1,
    lessons: [
      { _id: "l1", title: "Intro", order: 1 },
      { _id: "l2", title: "Setup", order: 2 },
    ],
    hasDeck: true,
    test: { _id: "t1", version: 1, questionCount: 4, passPercent: 70, maxAttempts: 3 },
  },
] as never[];

beforeEach(() => {
  updateChapter.mockReset().mockResolvedValue(undefined);
  for (const k of Object.keys(data)) delete data[k];
  data.get = { _id: "job1", status: "ready" };
  data.events = [];
});

describe("ChaptersPanel", () => {
  test("lists chapters with lesson links and saves a renamed chapter", async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    expect(screen.getByRole("link", { name: "Intro" })).toHaveAttribute("href", "/admin/courses/c1/lessons/l1");
    await user.clear(screen.getByLabelText("Chapter 1 title"));
    await user.type(screen.getByLabelText("Chapter 1 title"), "Foundations");
    await user.click(screen.getByRole("button", { name: "Save chapter 1" }));
    expect(updateChapter).toHaveBeenCalledWith({ chapterId: "ch1", title: "Foundations", summary: "Start here" });
  });

  test("regenerate controls appear only for generated courses", () => {
    const { rerender } = render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    expect(screen.getByRole("button", { name: "Regenerate lesson Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate chapter 1" })).toBeInTheDocument();
    rerender(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" />);
    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
  });

  test("shows Regenerating while the job is writing", () => {
    data.get = { _id: "job1", status: "writing" };
    data.events = [{ _id: "e1", message: "Writing chapter 1", kind: "chapter" }];
    render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    expect(screen.getByText(/Regenerating…/)).toBeInTheDocument();
    expect(screen.getByText(/Writing chapter 1/)).toBeInTheDocument();
  });

  test("a failed job shows its error and links to the job page", () => {
    data.get = { _id: "job1", status: "failed", error: "No progress for 15 minutes" };
    render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Regeneration failed: No progress for 15 minutes");
    expect(screen.getByRole("link", { name: "Open the generation job to retry" })).toHaveAttribute(
      "href",
      "/admin/generate/job1",
    );
    expect(screen.queryByText(/Regenerating…/)).not.toBeInTheDocument();
  });

  test("no failure banner while ready or writing", () => {
    render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    expect(screen.queryByText(/Regeneration failed/)).not.toBeInTheDocument();
  });

  test("an open deck editor is paused while the job is writing", async () => {
    data.get = { _id: "job1", status: "writing" };
    data.getDeck = { _id: "d1", slides: [] };
    const user = userEvent.setup();
    render(<ChaptersPanel courseId={"c1" as never} chapters={chapters} language="en" jobId="job1" />);
    await user.click(screen.getByRole("button", { name: "Edit deck" }));
    expect(screen.getByText("Regenerating — editing is paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save deck" })).toBeDisabled();
  });
});
