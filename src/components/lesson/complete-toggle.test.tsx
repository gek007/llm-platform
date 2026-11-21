import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { CompleteToggle } from "./complete-toggle";

// The spy only records calls; the behavior is a plain function so vitest does not track rejected promises.
const mutate = vi.fn();
let behavior: () => Promise<unknown> = () => Promise.resolve(true);
const run = (...args: unknown[]) => {
  mutate(...args);
  return behavior();
};
vi.mock("convex/react", () => ({
  useMutation: () => Object.assign(run, { withOptimisticUpdate: () => run }),
}));

const props = {
  lessonId: "lesson1" as Id<"lessons">,
  courseId: "course1" as Id<"courses">,
  signedIn: true,
  returnTo: "/courses/c/lessons/l",
};

beforeEach(() => {
  mutate.mockReset();
  behavior = () => Promise.resolve(true);
});

describe("CompleteToggle", () => {
  test("marks a lesson complete", async () => {
    render(<CompleteToggle {...props} completed={false} />);
    const button = screen.getByRole("button", { name: "Mark as complete" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(button);
    expect(mutate).toHaveBeenCalledWith({ lessonId: "lesson1", complete: true });
  });

  test("unmarks a completed lesson", async () => {
    render(<CompleteToggle {...props} completed />);
    const button = screen.getByRole("button", { name: "Completed" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(button);
    expect(mutate).toHaveBeenCalledWith({ lessonId: "lesson1", complete: false });
  });

  test("shows an alert when the mutation fails", async () => {
    behavior = () => Promise.reject(new Error("nope"));
    render(<CompleteToggle {...props} completed={false} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark as complete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update progress");
  });

  test("signed out shows a sign-in link instead", () => {
    render(<CompleteToggle {...props} signedIn={false} completed={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", expect.stringContaining("/sign-in"));
  });

  test("an agent can find and press the toggle", async () => {
    const agent = createAgent();
    render(<CompleteToggle {...props} completed={false} />);
    const entries = agent.snapshot().filter((e) => !e.offPage && e.component !== "more");
    expect(entries.map((e) => e.label)).toContain("Mark as complete");
    const result = await agent.act({ steps: [{ ref: "Mark as complete", action: "press" }] });
    expect(result.ok, result.error?.message).toBe(true);
    expect(mutate).toHaveBeenCalledWith({ lessonId: "lesson1", complete: true });
  });
});
