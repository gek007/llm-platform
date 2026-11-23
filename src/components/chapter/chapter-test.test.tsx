import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChapterTest } from "./chapter-test";

const submit = vi.fn();
let testData: unknown;
let viewer: unknown;

vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args?: unknown) =>
    args && typeof args === "object" && "testId" in args ? testData : viewer,
  useMutation: () => (...args: unknown[]) => submit(...args),
}));

const testId = "t1" as Id<"chapterTests">;

const base = {
  testId,
  version: 2,
  passPercent: 70,
  maxAttempts: 3,
  attemptsUsed: 0,
  best: null,
  language: "en",
  questions: [
    { id: "q1", kind: "single", prompt: "Pick one", options: ["A", "B", "C"] },
    { id: "q2", kind: "multiple", prompt: "Pick many", options: ["X", "Y", "Z"] },
    { id: "q3", kind: "true_false", prompt: "Sky is blue", options: ["True", "False"] },
  ],
};

const result = {
  scorePercent: 33,
  passed: false,
  attemptsLeft: 2,
  results: [
    { id: "q1", correct: true, correctOptions: [1], explanation: "B is right" },
    { id: "q2", correct: false, correctOptions: [0, 2], explanation: "X and Z" },
    { id: "q3", correct: false, correctOptions: [0], explanation: "It is blue" },
  ],
};

async function answerAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "B" }));
  await user.click(screen.getByRole("checkbox", { name: "X" }));
  await user.click(screen.getByRole("radio", { name: "True" }));
}

beforeEach(() => {
  submit.mockReset();
  testData = base;
  viewer = { signedIn: true };
});

describe("ChapterTest", () => {
  test("Submit is disabled until every question is answered, then sends testId, version and answers", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue(result);
    render(<ChapterTest testId={testId} />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "B" }));
    await user.click(screen.getByRole("radio", { name: "True" }));
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "X" }));
    await user.click(screen.getByRole("checkbox", { name: "Z" }));
    expect(button).toBeEnabled();
    await user.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      testId,
      version: 2,
      answers: { q1: [1], q2: [0, 2], q3: [0] },
    });
  });

  test("does not double submit while pending", async () => {
    const user = userEvent.setup();
    submit.mockReturnValue(new Promise(() => {}));
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    const button = screen.getByRole("button", { name: "Submit" });
    await user.click(button);
    await user.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test("result shows score, failed, correct answers and explanations, and Try again resets", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue(result);
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("33%")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("B is right")).toBeInTheDocument();
    expect(screen.getByText("X and Z")).toBeInTheDocument();
    expect(screen.getByText("It is blue")).toBeInTheDocument();
    expect(screen.getAllByText("Correct")).toHaveLength(1);
    expect(screen.getAllByText("Incorrect")).toHaveLength(2);
    const q2 = screen.getByText("Pick many").closest("li")!;
    expect(within(q2).getByText("Correct answer: X, Z")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again (2 left)" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "B" })).not.toBeChecked();
  });

  test("passed result", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ ...result, scorePercent: 100, passed: true, attemptsLeft: 1 });
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Passed")).toBeInTheDocument();
  });

  test("no attempts left after the last submission hides Try again", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ ...result, attemptsLeft: 0 });
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("No attempts left")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeInTheDocument();
  });

  test("already exhausted on load shows best result instead of the form", () => {
    testData = { ...base, attemptsUsed: 3, best: { scorePercent: 60, passed: false } };
    render(<ChapterTest testId={testId} />);
    expect(screen.getByText("No attempts left")).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("TEST_CHANGED shows a notice and clears answers", async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new ConvexError("TEST_CHANGED"));
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("This test was updated")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "B" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  test("other errors show a generic message and re-enable Submit", async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new ConvexError("NO_ATTEMPTS_LEFT"));
    render(<ChapterTest testId={testId} />);
    await answerAll(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("NO_ATTEMPTS_LEFT");
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());
  });

  test("Hebrew is RTL with dir=auto question text", () => {
    testData = { ...base, language: "he" };
    const { container } = render(<ChapterTest testId={testId} />);
    const root = container.querySelector('[lang="he"]');
    expect(root).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Pick one")).toHaveAttribute("dir", "auto");
    expect(screen.getByText("A")).toHaveAttribute("dir", "auto");
  });

  test("signed out shows a sign-in prompt", () => {
    testData = null;
    viewer = { signedIn: false };
    render(<ChapterTest testId={testId} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      expect.stringContaining("/sign-in"),
    );
  });

  test("signed in but unavailable shows a message", () => {
    testData = null;
    render(<ChapterTest testId={testId} />);
    expect(screen.getByText("This test is not available.")).toBeInTheDocument();
  });

  test("createAgent can answer and submit", async () => {
    submit.mockResolvedValue(result);
    const agent = createAgent();
    render(<ChapterTest testId={testId} />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Question 1: Pick one", "Question 2: Pick many", "Question 3: Sky is blue", "Submit"]));
    await act(async () => {
      const r = await agent.act({
        steps: [
          { ref: "Question 1: Pick one", action: "setValue", args: ["1"] },
          { ref: "Question 2: Pick many", action: "setValue", args: [["0"]] },
          { ref: "Question 3: Sky is blue", action: "setValue", args: ["0"] },
        ],
      });
      expect(r.ok, r.error?.message).toBe(true);
    });
    await act(async () => {
      const r = await agent.act({ steps: [{ ref: "Submit", action: "press" }] });
      expect(r.ok, r.error?.message).toBe(true);
    });
    expect(submit).toHaveBeenCalledWith({ testId, version: 2, answers: { q1: [1], q2: [0], q3: [0] } });
  });
});
