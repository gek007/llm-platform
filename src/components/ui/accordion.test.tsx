import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "./accordion";

function Example({ triggerClassName }: { triggerClassName?: string | ((state: { open: boolean }) => string | undefined) }) {
  return (
    <Accordion aria-label="Example" className="mt-4">
      <AccordionItem value="one">
        <AccordionHeader>
          <AccordionTrigger className={triggerClassName}>One</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel className="extra-panel">First panel</AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

describe("ui/Accordion", () => {
  test("keeps its own styles and adds the caller's classes", async () => {
    const user = userEvent.setup();
    render(<Example triggerClassName="extra-trigger" />);

    const trigger = screen.getByRole("button", { name: "One" });
    expect(trigger).toHaveClass("flex", "extra-trigger");
    expect(trigger.closest('[data-slot="accordion"]')).toHaveClass("rounded-lg", "mt-4");

    await user.click(trigger);
    expect(screen.getByRole("region", { name: "One" })).toHaveClass("px-4", "extra-panel");
  });

  test("supports state-based classNames", async () => {
    const user = userEvent.setup();
    render(<Example triggerClassName={(state) => (state.open ? "is-open" : undefined)} />);

    const trigger = screen.getByRole("button", { name: "One" });
    expect(trigger).toHaveClass("flex");
    expect(trigger).not.toHaveClass("is-open");
    await user.click(trigger);
    expect(trigger).toHaveClass("flex", "is-open");
  });

  test("the chevron is hidden from assistive technology", () => {
    render(<Example />);
    const svg = screen.getByRole("button", { name: "One" }).querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  test("keeps the chevron when children are a function of state", async () => {
    const user = userEvent.setup();
    render(
      <Accordion aria-label="Example">
        <AccordionItem value="one">
          <AccordionHeader>
            <AccordionTrigger>{(state) => (state.open ? "Hide" : "Show")}</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Panel</AccordionPanel>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Show" });
    expect(trigger.querySelector("svg")).toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAccessibleName("Hide");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
  });
});
