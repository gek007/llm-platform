import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TestEditor } from "./test-editor";

const updateTest = vi.fn();
const data: Record<string, unknown> = {};

vi.mock("@/components/admin/use-admin-query", () => ({
  useAdminQuery: (ref: { name: string }) => data[ref.name],
}));
vi.mock("convex/react", () => ({ useMutation: () => updateTest }));
vi.mock("../../../convex/_generated/api", () => ({
  api: { admin: { getTest: { name: "getTest" }, updateTest: { name: "updateTest" } } },
}));

const questions = [
  { id: "q1", kind: "single", prompt: "Pick one", options: ["A", "B", "C"], correct: [0], explanation: "A is right" },
  { id: "q2", kind: "true_false", prompt: "Sky is blue", options: ["True", "False"], correct: [0], explanation: "Yes" },
];

beforeEach(() => {
  updateTest.mockReset().mockResolvedValue(undefined);
  data.getTest = { _id: "t1", version: 2, passPercent: 70, maxAttempts: 3, questions };
});

describe("TestEditor", () => {
  test("warns that content changes create a new version", () => {
    render(<TestEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByText(/Saving changes question content creates a new version/)).toBeInTheDocument();
  });

  test("blocks saving a single question with two correct answers", async () => {
    const user = userEvent.setup();
    render(<TestEditor chapterId={"ch1" as never} language="en" />);
    await user.click(screen.getByRole("checkbox", { name: "Question 1 option 2 correct" }));
    await user.click(screen.getByRole("button", { name: "Save test" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Question 1.*exactly 1 correct/);
    expect(updateTest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Question 1 option 1 correct" }));
    await user.click(screen.getByRole("button", { name: "Save test" }));
    expect(updateTest).toHaveBeenCalledTimes(1);
    const payload = updateTest.mock.calls[0][0] as { questions: { correct: number[] }[]; passPercent: number; maxAttempts: number };
    expect(payload.questions[0].correct).toEqual([1]);
    expect(payload).toMatchObject({ chapterId: "ch1", passPercent: 70, maxAttempts: 3 });
  });

  test("edits prompt, adds an option and sends pass mark and attempts", async () => {
    const user = userEvent.setup();
    render(<TestEditor chapterId={"ch1" as never} language="he" />);
    expect(screen.getByLabelText("Question 1 prompt")).toHaveAttribute("dir", "auto");
    await user.clear(screen.getByLabelText("Question 1 prompt"));
    await user.type(screen.getByLabelText("Question 1 prompt"), "New prompt");
    await user.click(screen.getByRole("button", { name: "Add option to question 1" }));
    await user.type(screen.getByLabelText("Question 1 option 4"), "D");
    await user.clear(screen.getByLabelText("Pass mark (%)"));
    await user.type(screen.getByLabelText("Pass mark (%)"), "80");
    await user.clear(screen.getByLabelText("Max attempts"));
    await user.type(screen.getByLabelText("Max attempts"), "5");
    await user.click(screen.getByRole("button", { name: "Save test" }));
    const payload = updateTest.mock.calls[0][0] as { questions: { prompt: string; options: string[] }[]; passPercent: number; maxAttempts: number };
    expect(payload.questions[0].prompt).toBe("New prompt");
    expect(payload.questions[0].options).toEqual(["A", "B", "C", "D"]);
    expect(payload.passPercent).toBe(80);
    expect(payload.maxAttempts).toBe(5);
  });

  test("shows a missing test message", () => {
    data.getTest = null;
    render(<TestEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByText("This chapter has no test yet.")).toBeInTheDocument();
  });

  test("an agent can set the pass mark and save", async () => {
    const agent = createAgent();
    render(<TestEditor chapterId={"ch1" as never} language="en" />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Pass mark (%)", "Max attempts", "Save test", "Question 1 prompt"]));
    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Pass mark (%)", action: "setValue", args: ["60"] },
          { ref: "Save test", action: "press" },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect((updateTest.mock.calls[0][0] as { passPercent: number }).passPercent).toBe(60);
  });

  test("paused while regenerating: Save is disabled with a notice", () => {
    render(<TestEditor chapterId={"ch1" as never} language="en" paused />);
    expect(screen.getByText("Regenerating — editing is paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save test" })).toBeDisabled();
  });

  test("a new version while clean refreshes; while dirty it warns and keeps edits", async () => {
    const user = userEvent.setup();
    const next = { _id: "t1", version: 3, passPercent: 70, maxAttempts: 3, questions: questions.map((q) => ({ ...q, prompt: `R ${q.prompt}` })) };
    const clean = render(<TestEditor chapterId={"ch1" as never} language="en" />);
    data.getTest = next;
    clean.rerender(<TestEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByLabelText("Question 1 prompt")).toHaveValue("R Pick one");
    clean.unmount();

    data.getTest = { _id: "t1", version: 2, passPercent: 70, maxAttempts: 3, questions };
    const dirty = render(<TestEditor chapterId={"ch1" as never} language="en" />);
    await user.type(screen.getByLabelText("Question 1 prompt"), "?");
    data.getTest = next;
    dirty.rerender(<TestEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByText(/changed on the server/)).toBeInTheDocument();
    expect(screen.getByLabelText("Question 1 prompt")).toHaveValue("Pick one?");
    await user.click(screen.getByRole("button", { name: "Discard my changes and reload" }));
    expect(screen.getByLabelText("Question 1 prompt")).toHaveValue("R Pick one");
  });

  test("keeps the Test saved confirmation after a content save bumps the version", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TestEditor chapterId={"ch1" as never} language="en" />);
    await user.type(screen.getByLabelText("Question 1 prompt"), "?");
    await user.click(screen.getByRole("button", { name: "Save test" }));
    expect(await screen.findByText("Test saved.")).toBeInTheDocument();
    data.getTest = { _id: "t1", version: 3, passPercent: 70, maxAttempts: 3, questions: [{ ...questions[0], prompt: "Pick one?" }, questions[1]] };
    rerender(<TestEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByText("Test saved.")).toBeInTheDocument();
    expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
  });
});
