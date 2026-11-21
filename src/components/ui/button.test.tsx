import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Button } from "./button";

describe("ui/Button", () => {
  test("applies variant styles and merges caller classes", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button variant="secondary" className="extra-btn" onClick={onClick}>
        Open Learnly
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Open Learnly" });
    expect(button).toHaveClass("inline-flex", "border", "extra-btn");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("supports state-based className functions", () => {
    render(
      <Button
        disabled
        className={(state) => (state.disabled ? "is-disabled" : undefined)}
      >
        Unavailable
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Unavailable" })).toHaveClass(
      "inline-flex",
      "is-disabled",
    );
  });
});
