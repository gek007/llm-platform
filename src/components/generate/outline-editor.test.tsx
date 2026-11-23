import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_CHAPTERS, MAX_SUBCHAPTERS, type Outline } from "../../../convex/lib/engineTypes";
import { OutlineEditor } from "./outline-editor";

const updateOutline = vi.fn();
const fetchMock = vi.fn();

vi.mock("convex/react", () => ({ useMutation: () => updateOutline }));
vi.mock("../../../convex/_generated/api", () => ({
  api: { generation: { updateOutline: { name: "updateOutline" } } },
}));

const outline: Outline = {
  chapters: [
    { title: "Basics", goal: "Learn basics", subchapters: [{ title: "Intro", goal: "Say hi", resourceIds: ["r1"] }, { title: "Setup", goal: "Install" }] },
    { title: "Advanced", goal: "Go deep", subchapters: [{ title: "Tuning", goal: "Tune" }] },
  ],
};

beforeEach(() => {
  updateOutline.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("OutlineEditor", () => {
  test("renames, reorders and saves, preserving resourceIds", async () => {
    const user = userEvent.setup();
    render(<OutlineEditor jobId="job1" outline={outline} language="he" />);
    expect(screen.getByLabelText("Chapter 1 title")).toHaveAttribute("dir", "auto");
    await user.clear(screen.getByLabelText("Chapter 1 title"));
    await user.type(screen.getByLabelText("Chapter 1 title"), "Foundations");
    await user.click(screen.getByRole("button", { name: "Move chapter 1 down" }));
    expect(screen.getByLabelText("Chapter 2 title")).toHaveValue("Foundations");
    await user.click(screen.getByRole("button", { name: "Save outline" }));
    expect(updateOutline).toHaveBeenCalledTimes(1);
    const saved = updateOutline.mock.calls[0][0] as { jobId: string; outline: Outline };
    expect(saved.jobId).toBe("job1");
    expect(saved.outline.chapters.map((c) => c.title)).toEqual(["Advanced", "Foundations"]);
    expect(saved.outline.chapters[1].subchapters[0].resourceIds).toEqual(["r1"]);
  });

  test("first chapter cannot move up; removal keeps at least one chapter", async () => {
    const user = userEvent.setup();
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    expect(screen.getByRole("button", { name: "Move chapter 1 up" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove chapter 2" }));
    expect(screen.getByRole("button", { name: "Remove chapter 1" })).toBeDisabled();
  });

  test("enforces the 10 chapter and 5 subchapter caps", async () => {
    const user = userEvent.setup();
    const big: Outline = {
      chapters: Array.from({ length: MAX_CHAPTERS }, (_, i) => ({
        title: `C${i}`,
        goal: "g",
        subchapters: Array.from({ length: i === 0 ? MAX_SUBCHAPTERS - 1 : 1 }, (_, j) => ({ title: `S${j}`, goal: "g" })),
      })),
    };
    render(<OutlineEditor jobId="job1" outline={big} language="en" />);
    expect(screen.getByRole("button", { name: "Add chapter" })).toBeDisabled();
    const add = screen.getByRole("button", { name: "Add subchapter to chapter 1" });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(screen.getByRole("button", { name: "Add subchapter to chapter 1" })).toBeDisabled();
    expect(screen.getByLabelText(`Subchapter 1.${MAX_SUBCHAPTERS} title`)).toBeInTheDocument();
  });

  test("Add chapter appends an empty chapter that must be filled before saving", async () => {
    const user = userEvent.setup();
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    await user.click(screen.getByRole("button", { name: "Add chapter" }));
    expect(screen.getByLabelText("Chapter 3 title")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save outline" }));
    expect(updateOutline).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/title and a goal/i);
  });

  test("disables Approve and Save while saving", async () => {
    const user = userEvent.setup();
    updateOutline.mockReturnValue(new Promise(() => {}));
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    await user.type(screen.getByLabelText("Chapter 1 title"), "!");
    await user.click(screen.getByRole("button", { name: "Save outline" }));
    expect(screen.getByRole("button", { name: "Approve and write" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save outline" })).toBeDisabled();
  });

  test("Approve posts to /approve (saving first when edited)", async () => {
    const user = userEvent.setup();
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    await user.click(screen.getByRole("button", { name: "Approve and write" }));
    expect(updateOutline).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/course-builder/approve",
      expect.objectContaining({ body: JSON.stringify({ jobId: "job1" }) }),
    );
  });

  test("a 409 on approve shows the current status", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "BAD_STATE", status: "writing" }), { status: 409 }));
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    await user.click(screen.getByRole("button", { name: "Approve and write" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already writing");
  });

  test("goal editing is scoped per subchapter", async () => {
    const user = userEvent.setup();
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    const goal = screen.getByLabelText("Subchapter 1.2 goal");
    await user.clear(goal);
    await user.type(goal, "Install tools");
    expect(within(goal.closest("li")!).getByLabelText("Subchapter 1.2 title")).toHaveValue("Setup");
  });

  test("an agent can find the controls and drive Add chapter and Save", async () => {
    const agent = createAgent();
    render(<OutlineEditor jobId="job1" outline={outline} language="en" />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Chapter 1 title", "Add chapter", "Save outline", "Approve and write"]));
    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Chapter 1 title", action: "setValue", args: ["Renamed"] },
          { ref: "Save outline", action: "press" },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(updateOutline).toHaveBeenCalledTimes(1);
  });
});
