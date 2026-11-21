import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LessonForm } from "./lesson-form";

const update = vi.fn();
vi.mock("convex/react", () => ({ useMutation: () => update }));
vi.mock("../../../convex/_generated/api", () => ({
  api: { admin: { updateLesson: { name: "updateLesson" } } },
}));

const lesson = {
  _id: "l1",
  _creationTime: 1,
  courseId: "c1",
  slug: "hello",
  title: "Hello",
  summary: "s",
  body: "# Heading",
  order: 1,
  durationMinutes: 5,
  isFreePreview: false,
} as never;

beforeEach(() => update.mockReset().mockResolvedValue(undefined));

describe("LessonForm", () => {
  test("renders a live markdown preview that follows the editor", async () => {
    const user = userEvent.setup();
    render(<LessonForm lesson={lesson} />);
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Body (markdown)"), "\n\n## Second");
    expect(screen.getByRole("heading", { name: "Second" })).toBeInTheDocument();
  });

  test("inserts a quiz block", async () => {
    const user = userEvent.setup();
    render(<LessonForm lesson={lesson} />);
    await user.click(screen.getByRole("button", { name: "Insert quiz block" }));
    expect((screen.getByLabelText("Body (markdown)") as HTMLTextAreaElement).value).toContain("```quiz");
  });

  test("validates duration and slug", async () => {
    const user = userEvent.setup();
    render(<LessonForm lesson={lesson} />);
    const duration = screen.getByLabelText("Duration (minutes)");
    await user.clear(duration);
    await user.type(duration, "abc");
    await user.clear(screen.getByLabelText("Slug"));
    await user.click(screen.getByRole("button", { name: "Save lesson" }));
    expect(screen.getByText("Slug is required.")).toBeInTheDocument();
    expect(screen.getByText(/duration in minutes/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  test("saves all fields including the free-preview switch", async () => {
    const user = userEvent.setup();
    render(<LessonForm lesson={lesson} />);
    await user.click(screen.getByRole("switch", { name: "Free preview" }));
    await user.click(screen.getByRole("button", { name: "Save lesson" }));
    expect(update).toHaveBeenCalledWith({
      lessonId: "l1",
      slug: "hello",
      title: "Hello",
      summary: "s",
      body: "# Heading",
      durationMinutes: 5,
      isFreePreview: true,
    });
    expect(await screen.findByText("Lesson saved.")).toBeInTheDocument();
  });
});
