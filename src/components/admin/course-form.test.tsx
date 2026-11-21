import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CourseForm } from "./course-form";

const create = vi.fn();
const update = vi.fn();
const push = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (ref: { name: string }) => (ref.name === "createCourse" ? create : update),
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: { admin: { createCourse: { name: "createCourse" }, updateCourse: { name: "updateCourse" } } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  create.mockReset().mockResolvedValue("course123");
  update.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

describe("CourseForm", () => {
  test("validates required fields and slug format without calling the mutation", async () => {
    const user = userEvent.setup();
    render(<CourseForm />);
    await user.click(screen.getByRole("button", { name: "Create course" }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Slug is required.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Slug"), "Bad Slug");
    await user.click(screen.getByRole("button", { name: "Create course" }));
    expect(screen.getByText(/kebab-case/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  test("creates a course with all fields and navigates to the editor", async () => {
    const user = userEvent.setup();
    render(<CourseForm />);
    await user.type(screen.getByLabelText("Title"), "Intro to Go");
    expect(screen.getByLabelText("Slug")).toHaveValue("intro-to-go");
    await user.type(screen.getByLabelText("Summary"), "Learn Go");
    await user.selectOptions(screen.getByLabelText("Tier"), "pro");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("Tags 1"), "go");
    await user.click(screen.getByRole("button", { name: "Add outcome" }));
    await user.type(screen.getByLabelText("Outcomes 1"), "Write Go");
    await user.click(screen.getByRole("button", { name: "Create course" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "intro-to-go",
        title: "Intro to Go",
        summary: "Learn Go",
        tier: "pro",
        level: "beginner",
        status: "draft",
        tags: ["go"],
        outcomes: ["Write Go"],
      }),
    );
    expect(push).toHaveBeenCalledWith("/admin/courses/course123");
  });

  test("edit mode saves via updateCourse and surfaces server errors", async () => {
    const user = userEvent.setup();
    const course = {
      _id: "c1",
      _creationTime: 1,
      slug: "x",
      title: "X",
      summary: "s",
      description: "",
      level: "beginner",
      tier: "free",
      status: "draft",
      tags: [],
      outcomes: [],
      order: 3,
    } as never;
    render(<CourseForm course={course} />);
    await user.click(screen.getByRole("button", { name: "Save course" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ courseId: "c1", order: 3 }));
    expect(await screen.findByText("Course saved.")).toBeInTheDocument();
    update.mockRejectedValueOnce(new Error("SLUG_TAKEN"));
    await user.click(screen.getByRole("button", { name: "Save course" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already in use/);
  });

  test("a UI SDK agent can see and operate the form", async () => {
    const uiAgent = createAgent();
    render(<CourseForm />);
    const labels = uiAgent
      .snapshot()
      .filter((entry) => !entry.offPage)
      .map((entry) => entry.label);
    expect(labels).toContain("Title");
    expect(labels).toContain("Slug");
    const result = await uiAgent.act({
      steps: [{ ref: "Title", action: "setValue", args: ["Agent course"] }],
    });
    expect(result.ok ?? true).toBeTruthy();
    expect(screen.getByLabelText("Title")).toHaveValue("Agent course");
  });
});
