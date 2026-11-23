import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { describe, expect, test, vi } from "vitest";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import { Slide } from "./slide";
import { SlideDeck } from "./slide-deck";

const slides: SlideData[] = [
  { layout: "title", title: "Intro", bullets: ["Welcome aboard"], notes: "Say hello" },
  { layout: "bullets", title: "Points", bullets: ["One", "Two"], notes: "Explain points" },
  { layout: "summary", title: "Wrap", bullets: ["Done"], notes: "Close out" },
];

const counter = () => screen.getByText(/\d+ \/ \d+/);

describe("SlideDeck", () => {
  test("Prev/Next buttons move the counter and the first slide disables Prev", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    expect(counter()).toHaveTextContent("1 / 3");
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(counter()).toHaveTextContent("2 / 3");
    await user.click(screen.getByRole("button", { name: "Prev" }));
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("arrow keys on the deck move the counter (LTR)", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    screen.getByRole("region", { name: "Deck" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{ArrowLeft}");
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("Next is disabled on the last slide", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("speaker notes are hidden until toggled", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    expect(screen.queryByText("Say hello")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speaker notes" }));
    expect(screen.getByText("Say hello")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speaker notes" }));
    expect(screen.queryByText("Say hello")).not.toBeInTheDocument();
  });

  test("Hebrew mirrors: dir=rtl and ArrowLeft advances", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="he" title="Deck" />);
    const region = screen.getByRole("region", { name: "Deck" });
    expect(region).toHaveAttribute("dir", "rtl");
    expect(region).toHaveAttribute("lang", "he");
    region.focus();
    await user.keyboard("{ArrowLeft}");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{ArrowRight}");
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("English deck sets no dir", () => {
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    expect(screen.getByRole("region", { name: "Deck" })).not.toHaveAttribute("dir");
  });

  test("Fullscreen requests fullscreen on the deck region", async () => {
    const user = userEvent.setup();
    const stub = vi.fn().mockResolvedValue(undefined);
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    const region = screen.getByRole("region", { name: "Deck" });
    region.requestFullscreen = stub;
    await user.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(stub).toHaveBeenCalledTimes(1);
  });

  test("Fullscreen is a no-op when the API is unavailable", async () => {
    const user = userEvent.setup();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    await user.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("empty slides render an empty state without crashing", () => {
    render(<SlideDeck slides={[]} language="en" title="Deck" />);
    expect(screen.getByRole("status")).toHaveTextContent(/no slides/i);
  });

  test("an agent can find every control and drive Next and the notes toggle", async () => {
    const agent = createAgent();
    render(<SlideDeck slides={slides} language="en" title="Deck" />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Prev", "Next", "Speaker notes", "Fullscreen"]),
    );
    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Next", action: "press" },
          { ref: "Speaker notes", action: "setPressed", args: [true] },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(counter()).toHaveTextContent("2 / 3");
    expect(screen.getByText("Explain points")).toBeInTheDocument();
  });
});

describe("Slide layouts", () => {
  test("title", () => {
    render(<Slide slide={slides[0]} />);
    expect(screen.getByRole("heading", { name: "Intro" })).toBeInTheDocument();
    expect(screen.getByText("Welcome aboard")).toBeInTheDocument();
  });
  test("bullets and summary", () => {
    const { rerender } = render(<Slide slide={slides[1]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    rerender(<Slide slide={slides[2]} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
  test("two-column", () => {
    render(
      <Slide
        slide={{ layout: "two-column", title: "Vs", left: ["L1"], right: ["R1", "R2"], notes: "" }}
      />,
    );
    expect(screen.getByText("L1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  test("quote", () => {
    render(
      <Slide
        slide={{ layout: "quote", title: "Words", quote: "Be kind", attribution: "Someone", notes: "" }}
      />,
    );
    expect(screen.getByText("Be kind")).toBeInTheDocument();
    expect(screen.getByText("Someone")).toBeInTheDocument();
  });
});
