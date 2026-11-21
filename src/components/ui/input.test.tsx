import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Input, InputClear, InputGroup } from "./input";

describe("ui/Input", () => {
  test("merges styles and lets InputClear empty the field", async () => {
    const user = userEvent.setup();
    render(
      <InputGroup className="extra-group">
        <Input aria-label="Question" className="extra-input" />
        <InputClear aria-label="Clear question">Clear</InputClear>
      </InputGroup>,
    );

    const input = screen.getByRole("textbox", { name: "Question" });
    expect(input).toHaveClass("w-full", "extra-input");
    expect(input.closest('[data-slot="input-group"]')).toHaveClass(
      "flex",
      "extra-group",
    );

    await user.type(input, "TypeScript");
    expect(input).toHaveValue("TypeScript");

    await user.click(screen.getByRole("button", { name: "Clear question" }));
    expect(input).toHaveValue("");
  });
});
