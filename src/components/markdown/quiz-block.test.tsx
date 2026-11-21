import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { describe, expect, test } from "vitest";
import type { Quiz } from "./quiz";
import { QuizBlock } from "./quiz-block";

const quiz: Quiz = {
  question: "What does `as const` do?",
  options: ["Makes a value mutable", "Narrows to literal readonly types", "Casts to any"],
  answer: 1,
  explanation: "It infers the narrowest, readonly type.",
};

describe("QuizBlock", () => {
  test("checks a correct answer and shows the explanation", async () => {
    const user = userEvent.setup();
    render(<QuizBlock quiz={quiz} />);

    const check = screen.getByRole("button", { name: "Check answer" });
    expect(check).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Narrows to literal/ }));
    await user.click(check);

    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
    expect(screen.getByRole("status")).toHaveTextContent("narrowest, readonly type");
  });

  test("flags a wrong answer, reveals the right one and allows a retry", async () => {
    const user = userEvent.setup();
    render(<QuizBlock quiz={quiz} />);

    await user.click(screen.getByRole("radio", { name: /Casts to any/ }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(screen.getByRole("status")).toHaveTextContent("Not quite.");
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
    expect(screen.getByText("Your answer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("status")?.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Casts to any/ })).not.toBeChecked();
  });

  test("is operable with the keyboard", async () => {
    const user = userEvent.setup();
    render(<QuizBlock quiz={quiz} />);

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Narrows to literal/ })).toBeChecked();

    await user.tab();
    expect(screen.getByRole("button", { name: "Check answer" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
  });

  test("names the radio group by its question", () => {
    render(<QuizBlock quiz={quiz} />);
    expect(screen.getByRole("radiogroup", { name: "What does as const do?" })).toBeInTheDocument();
  });

  test("an agent can find and answer the quiz", async () => {
    const agent = createAgent();
    render(<QuizBlock quiz={quiz} />);

    const components = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }
    const labels = components.map((entry) => entry.label);
    expect(labels).toEqual(expect.arrayContaining(["What does as const do?", "Check answer"]));
    const group = components.find((entry) => entry.component === "radio");
    const right = group?.items?.find((item) => item.label === "Narrows to literal readonly types");

    const result = await agent.act({
      steps: [
        { ref: "What does as const do?", action: "setValue", args: [right?.value] },
        { ref: "Check answer", action: "press" },
      ],
    });
    expect(result.ok, result.error?.message).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
  });
});
