import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Toggle } from "./toggle";

describe("ui/Toggle", () => {
  test("toggles aria-pressed and merges caller classes", async () => {
    const user = userEvent.setup();
    render(<Toggle className="extra-toggle">Speaker notes</Toggle>);
    const toggle = screen.getByRole("button", { name: "Speaker notes" });
    expect(toggle).toHaveClass("inline-flex", "extra-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
