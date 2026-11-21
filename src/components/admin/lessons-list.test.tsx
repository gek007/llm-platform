import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LessonsList } from "./lessons-list";

const reorder = vi.fn();
const create = vi.fn();
const push = vi.fn();
vi.mock("convex/react", () => ({
  useMutation: (ref: { name: string }) => (ref.name === "reorderLessons" ? reorder : create),
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: { admin: { reorderLessons: { name: "reorderLessons" }, createLesson: { name: "createLesson" } } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const lessons = ["a", "b", "c"].map((s, i) => ({
  _id: `id_${s}`,
  slug: s,
  title: `Lesson ${s}`,
  durationMinutes: 5,
  isFreePreview: false,
  order: i + 1,
})) as never[];

beforeEach(() => {
  reorder.mockReset().mockResolvedValue(undefined);
  create.mockReset().mockResolvedValue("newid");
  push.mockReset();
});

describe("LessonsList", () => {
  test("moves a lesson down and sends the full id order", async () => {
    const user = userEvent.setup();
    render(<LessonsList courseId={"c1" as never} lessons={lessons} />);
    await user.click(screen.getByRole("button", { name: "Move Lesson a down" }));
    expect(reorder).toHaveBeenCalledWith({ courseId: "c1", lessonIds: ["id_b", "id_a", "id_c"] });
    expect(screen.getByRole("button", { name: "Move Lesson a up" })).toBeDisabled();
  });

  test("adds a lesson with a unique slug and opens its editor", async () => {
    const user = userEvent.setup();
    render(<LessonsList courseId={"c1" as never} lessons={lessons} />);
    await user.type(screen.getByLabelText("New lesson title"), "A");
    await user.click(screen.getByRole("button", { name: "Add lesson" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ courseId: "c1", slug: "a-2", title: "A" }));
    expect(push).toHaveBeenCalledWith("/admin/courses/c1/lessons/newid");
  });
});
