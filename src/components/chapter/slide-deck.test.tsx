import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { deckSchema, validateGeneratedDeck, withSlideIds, type RenderableDeck } from "../../../convex/lib/deck";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import sample from "./samples/how-dns-works.deck.json";
import { Slide } from "./slide";
import { SlideDeck } from "./slide-deck";
import { SLIDE_LAYOUT_COMPONENTS } from "./slide-layouts";
import { fitScale, MIN_FIT } from "./slide-stage";

// The real libraries need a browser's layout; the deck's own logic is what these tests cover.
const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (id: string, code: string) => ({ svg: `<svg id="${id}"><title>${code.split("\n")[0]}</title></svg>` })),
}));
vi.mock("mermaid", () => ({ default: mermaid }));
vi.mock("./visuals/chart-visual", () => ({
  default: ({ chartType, data }: { chartType: string; data: unknown[] }) => (
    <div data-testid="chart" data-type={chartType} data-points={data.length} />
  ),
}));

const stored: SlideData[] = [
  { layout: "title", title: "Intro", bullets: ["Welcome aboard"], notes: "Say hello" },
  { layout: "bullets", title: "Points", bullets: ["One", "Two"], notes: "Explain points" },
  { layout: "summary", title: "Wrap", bullets: ["Done"], notes: "Close out" },
];
const deck = (slides: SlideData[] = stored): RenderableDeck => ({ chapterId: "ch1", title: "Deck", slides: withSlideIds(slides) });

const counter = () => screen.getByText(/^\d+ \/ \d+$/);
const region = () => screen.getByRole("region", { name: "Deck" });

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SlideDeck navigation", () => {
  test("Prev/Next buttons move the counter and the first slide disables Prev", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    expect(counter()).toHaveTextContent("1 / 3");
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(counter()).toHaveTextContent("2 / 3");
    await user.click(screen.getByRole("button", { name: "Prev" }));
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("Next is disabled on the last slide", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("keyboard on the deck: arrows, Space and Shift+Space, PageUp/PageDown, Home and End", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    region().focus();
    await user.keyboard("{ArrowRight}");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{ArrowLeft}");
    expect(counter()).toHaveTextContent("1 / 3");
    await user.keyboard(" ");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{Shift>} {/Shift}");
    expect(counter()).toHaveTextContent("1 / 3");
    await user.keyboard("{PageDown}{PageDown}{PageDown}");
    expect(counter()).toHaveTextContent("3 / 3");
    await user.keyboard("{PageUp}");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{Home}");
    expect(counter()).toHaveTextContent("1 / 3");
    await user.keyboard("{End}");
    expect(counter()).toHaveTextContent("3 / 3");
  });

  test("Space on a focused control presses that control instead of advancing twice", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    screen.getByRole("button", { name: "Speaker notes" }).focus();
    await user.keyboard(" ");
    expect(counter()).toHaveTextContent("1 / 3");
    expect(screen.getByText("Say hello")).toBeInTheDocument();
  });

  test("keys with a modifier are left to the browser", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    region().focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("Hebrew mirrors: dir=rtl and ArrowLeft advances", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="he" />);
    expect(region()).toHaveAttribute("dir", "rtl");
    expect(region()).toHaveAttribute("lang", "he");
    region().focus();
    await user.keyboard("{ArrowLeft}");
    expect(counter()).toHaveTextContent("2 / 3");
    await user.keyboard("{ArrowRight}");
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("English deck sets no dir", () => {
    render(<SlideDeck deck={deck()} language="en" />);
    expect(region()).not.toHaveAttribute("dir");
  });

  test("a swipe moves one slide; a small drag does not", () => {
    render(<SlideDeck deck={deck()} language="en" />);
    const stage = screen.getByRole("heading", { name: "Intro" }).closest(".slide-stage")!.parentElement!;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 280 }] });
    expect(counter()).toHaveTextContent("1 / 3");
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    expect(counter()).toHaveTextContent("2 / 3");
  });
});

describe("SlideDeck chrome", () => {
  test("the progress bar follows the slide", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    const bar = screen.getByRole("progressbar", { name: "Deck progress" });
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeCloseTo(100 / 3, 1);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  test("speaker notes are hidden until toggled and follow the slide", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    expect(screen.queryByText("Say hello")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speaker notes" }));
    expect(screen.getByText("Say hello")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Explain points")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speaker notes" }));
    expect(screen.queryByText("Explain points")).not.toBeInTheDocument();
  });

  test("Escape opens the overview of all slides; picking one goes there and closes it", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    region().focus();
    await user.keyboard("{Escape}");
    const list = screen.getByRole("list", { name: "All slides" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByRole("button", { name: "Slide 1: Intro" })).toHaveAttribute("aria-current", "true");
    // The slide itself is replaced by the overview.
    expect(screen.queryByRole("heading", { name: "Intro" })).not.toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Slide 3: Wrap" }));
    expect(screen.queryByRole("list", { name: "All slides" })).not.toBeInTheDocument();
    expect(counter()).toHaveTextContent("3 / 3");
    expect(screen.getByRole("heading", { name: "Wrap" })).toBeInTheDocument();
  });

  test("in the overview, arrows move the current slide, Enter opens it and Escape closes it", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    region().focus();
    await user.keyboard("{Escape}{ArrowRight}");
    expect(screen.getByRole("button", { name: "Slide 2: Points" })).toHaveAttribute("aria-current", "true");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Points" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("list", { name: "All slides" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("list", { name: "All slides" })).not.toBeInTheDocument();
  });

  test("the Overview toggle does the same as Escape", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("list", { name: "All slides" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-pressed", "true");
  });

  test("Fullscreen requests fullscreen on the deck region and offers the way back", async () => {
    const user = userEvent.setup();
    const request = vi.fn().mockResolvedValue(undefined);
    render(<SlideDeck deck={deck()} language="en" />);
    region().requestFullscreen = request;
    await user.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(request).toHaveBeenCalledTimes(1);

    // jsdom has no Fullscreen API: stand in for the browser entering fullscreen on the deck.
    const deckRegion = region();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => deckRegion });
    act(() => void document.dispatchEvent(new Event("fullscreenchange")));
    const exit = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = exit;
    await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(exit).toHaveBeenCalledTimes(1);
    // While fullscreen, Escape belongs to the browser: it does not open the overview.
    region().focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("list", { name: "All slides" })).not.toBeInTheDocument();
    delete (document as { fullscreenElement?: Element }).fullscreenElement;
  });

  test("Fullscreen is a no-op when the API is unavailable", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck()} language="en" />);
    await user.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("the deck is dark by default; Light slides switches its theme and is remembered", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SlideDeck deck={deck()} language="en" />);
    expect(region()).toHaveAttribute("data-theme", "dark");
    await user.click(screen.getByRole("button", { name: "Light slides" }));
    expect(region()).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("learnly.deck.theme")).toBe("light");
    unmount();
    render(<SlideDeck deck={deck()} language="en" />);
    expect(region()).toHaveAttribute("data-theme", "light");
    await user.click(screen.getByRole("button", { name: "Light slides" }));
    expect(region()).toHaveAttribute("data-theme", "dark");
  });

  test("empty slides render an empty state without crashing", () => {
    render(<SlideDeck deck={deck([])} language="en" />);
    expect(screen.getByRole("status")).toHaveTextContent(/no slides/i);
  });

  test("the region takes its name from the deck title unless a label is given", () => {
    const { rerender } = render(<SlideDeck deck={{ ...deck(), title: "How DNS works" }} language="en" />);
    expect(screen.getByRole("region", { name: "How DNS works" })).toBeInTheDocument();
    rerender(<SlideDeck deck={deck()} language="en" label="Chapter one slides" />);
    expect(screen.getByRole("region", { name: "Chapter one slides" })).toBeInTheDocument();
  });

  test("an agent can find every control and drive Next, the notes and the overview", async () => {
    const agent = createAgent();
    render(<SlideDeck deck={deck()} language="en" />);
    const labels = agent
      .snapshot()
      .filter((e) => !e.offPage)
      .map((e) => e.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Prev", "Next", "Overview", "Speaker notes", "Light slides", "Fullscreen", "Deck progress"]),
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
    await act(async () => {
      const result = await agent.act({ steps: [{ ref: "Overview", action: "setPressed", args: [true] }] });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(screen.getByRole("button", { name: "Slide 3: Wrap" })).toBeInTheDocument();
  });
});

describe("Slide layouts", () => {
  const base = { id: "s2", notes: "n" };

  test("every layout of the schema has a component", () => {
    expect(Object.keys(SLIDE_LAYOUT_COMPONENTS).sort()).toEqual(
      ["bullets", "bullets+visual", "code", "quote", "summary", "title", "two-column", "visual-full"].sort(),
    );
  });

  test("title", () => {
    render(<Slide slide={stored[0]} />);
    expect(screen.getByRole("heading", { name: "Intro" })).toBeInTheDocument();
    expect(screen.getByText("Welcome aboard")).toBeInTheDocument();
  });

  test("bullets and summary", () => {
    const { rerender } = render(<Slide slide={stored[1]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    rerender(<Slide slide={stored[2]} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  test("two-column", () => {
    render(<Slide slide={{ ...base, layout: "two-column", title: "Vs", left: ["L1"], right: ["R1", "R2"] }} />);
    expect(screen.getByText("L1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  test("quote", () => {
    render(<Slide slide={{ ...base, layout: "quote", title: "Words", quote: "Be kind", attribution: "Someone" }} />);
    expect(screen.getByText("Be kind")).toBeInTheDocument();
    expect(screen.getByText("Someone")).toBeInTheDocument();
  });

  test("code shows the language and the source as text, left to right", () => {
    render(<Slide slide={{ ...base, layout: "code", title: "Try it", code: { language: "bash", content: "dig example.com\n<b>not markup</b>" }, bullets: ["Run it"] }} />);
    expect(screen.getByText("bash")).toBeInTheDocument();
    const code = screen.getByText(/dig example\.com/);
    expect(code.tagName).toBe("CODE");
    expect(code).toHaveTextContent("<b>not markup</b>");
    expect(code.querySelector("b")).toBeNull();
    expect(code.closest("figure")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("Run it")).toBeInTheDocument();
  });

  test("bullets+visual with a table: headers, rows and the bullets side by side", () => {
    render(
      <Slide
        slide={{ ...base, layout: "bullets+visual", title: "Records", bullets: ["Each has a type"], visual: { type: "table", headers: ["Type", "Holds"], rows: [["A", "IPv4"], ["AAAA", "IPv6"]] } }}
      />,
    );
    expect(screen.getByText("Each has a type")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Type", "Holds"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "IPv6" })).toBeInTheDocument();
  });

  test("a chart is drawn lazily and carries the same numbers as a table for screen readers", async () => {
    render(
      <Slide
        slide={{ ...base, layout: "visual-full", title: "Timings", visual: { type: "chart", chartType: "bar", data: [{ label: "Uncached", value: 90 }, { label: "Cached", value: 1 }], caption: "Milliseconds" } }}
      />,
    );
    const table = screen.getByRole("table", { name: "Bar chart: Milliseconds" });
    expect(within(table).getByRole("rowheader", { name: "Uncached" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "90" })).toBeInTheDocument();
    const chart = await screen.findByTestId("chart");
    expect(chart).toHaveAttribute("data-type", "bar");
    expect(chart).toHaveAttribute("data-points", "2");
    expect(screen.getByText("Milliseconds")).toBeInTheDocument();
  });

  test("an image prompt is a placeholder showing its alt text, never the prompt", () => {
    render(
      <Slide
        slide={{ ...base, layout: "visual-full", title: "Picture", visual: { type: "image_prompt", prompt: "A globe wrapped in cables, flat illustration", alt: "A globe wrapped in cables" } }}
      />,
    );
    expect(screen.getByRole("img", { name: "A globe wrapped in cables" })).toBeInTheDocument();
    expect(screen.getByText("Illustration placeholder")).toBeInTheDocument();
    expect(screen.queryByText(/flat illustration/)).not.toBeInTheDocument();
  });

  test("an unknown layout from a newer deck falls back to bullets", () => {
    render(<Slide slide={{ ...base, layout: "timeline" as SlideData["layout"], title: "Later", bullets: ["Still readable"] }} />);
    expect(screen.getByRole("heading", { name: "Later" })).toBeInTheDocument();
    expect(screen.getByText("Still readable")).toBeInTheDocument();
  });
});

describe("Mermaid diagrams", () => {
  const diagram = (code: string): SlideData => ({
    id: "s3",
    layout: "visual-full",
    title: "The lookup",
    visual: { type: "mermaid", code, caption: "How a lookup flows" },
    notes: "n",
  });

  beforeEach(() => {
    mermaid.initialize.mockClear();
    mermaid.render.mockClear();
  });

  test("loads mermaid only for a slide with a diagram and draws its SVG, themed from the deck", async () => {
    const { rerender } = render(<Slide slide={stored[1]} />);
    expect(mermaid.render).not.toHaveBeenCalled();
    rerender(<Slide slide={diagram("flowchart LR\n  A --> B")} />);
    expect(screen.getByRole("status", { name: "Loading diagram" })).toBeInTheDocument();
    const drawn = await screen.findByRole("img", { name: "How a lookup flows" });
    expect(drawn.tagName.toLowerCase()).toBe("svg");
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^slide-diagram-\d+$/), "flowchart LR\n  A --> B");
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", theme: "base", startOnLoad: false, themeVariables: expect.any(Object) }),
    );
    expect(screen.queryByRole("status", { name: "Loading diagram" })).not.toBeInTheDocument();
    expect(screen.getByText("How a lookup flows")).toBeInTheDocument();
  });

  test("a diagram that cannot be drawn shows a notice and logs a warning; the slide stays up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mermaid.render.mockRejectedValueOnce(new Error("Parse error on line 2"));
    render(<Slide slide={diagram("flowchart LR\n  A[ --> B")} />);
    expect(await screen.findByRole("note")).toHaveTextContent("This diagram could not be displayed.");
    expect(screen.getByRole("heading", { name: "The lookup" })).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[SlideDeck] a diagram could not be drawn"), expect.any(Error));
  });

  test("switching the deck theme redraws the diagram", async () => {
    const user = userEvent.setup();
    render(<SlideDeck deck={deck([stored[0], diagram("flowchart LR\n  A --> B"), stored[2]])} language="en" />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("img", { name: "How a lookup flows" });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Light slides" }));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
  });
});

describe("overflow: a slide never spills outside its frame", () => {
  test("fitScale shrinks tall content, and clips below the minimum scale", () => {
    expect(fitScale(400, 500)).toEqual({ scale: 1, clipped: false });
    expect(fitScale(500, 500)).toEqual({ scale: 1, clipped: false });
    expect(fitScale(625, 500)).toEqual({ scale: 0.8, clipped: false });
    expect(fitScale(500 / MIN_FIT, 500)).toEqual({ scale: MIN_FIT, clipped: false });
    expect(fitScale(2000, 500)).toEqual({ scale: MIN_FIT, clipped: true });
    // Nothing measured yet (no layout): leave the slide as it is.
    expect(fitScale(0, 0)).toEqual({ scale: 1, clipped: false });
  });

  /** jsdom has no layout: report the given heights and run resize callbacks at once. */
  function withLayout(contentHeight: number, frameHeight: number) {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(contentHeight);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(frameHeight);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          this.callback();
        }
        unobserve() {}
        disconnect() {}
      },
    );
  }
  afterEach(() => vi.unstubAllGlobals());

  test("content taller than the frame is scaled to fit, and the frame hides anything outside it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    withLayout(625, 500);
    render(<Slide slide={stored[1]} />);
    const content = screen.getByRole("heading", { name: "Points" }).closest("[data-slot='slide-content']") as HTMLElement;
    expect(content.style.getPropertyValue("--slide-fit")).toBe("0.8");
    expect(content).toHaveAttribute("data-fitted", "center");
    expect(content.parentElement).toHaveClass("overflow-hidden");
    expect(warn).not.toHaveBeenCalled();
  });

  test("content wider than the frame (a wide table) is scaled from the near corner so its far edge fits", () => {
    withLayout(300, 500);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    render(<Slide slide={stored[1]} />);
    const content = screen.getByRole("heading", { name: "Points" }).closest("[data-slot='slide-content']") as HTMLElement;
    expect(content.style.getPropertyValue("--slide-fit")).toBe("0.8");
    expect(content).toHaveAttribute("data-fitted", "start");
  });

  test("content that would need less than the minimum scale is clipped and a warning names the slide", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    withLayout(2000, 500);
    render(<Slide slide={{ ...stored[1], id: "s7" }} />);
    const content = screen.getByRole("heading", { name: "Points" }).closest("[data-slot='slide-content']") as HTMLElement;
    expect(content.style.getPropertyValue("--slide-fit")).toBe(String(MIN_FIT));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[SlideDeck] slide "s7" has more content than fits'));
  });

  test("content that fits is not scaled", () => {
    withLayout(300, 500);
    render(<Slide slide={stored[1]} />);
    const content = screen.getByRole("heading", { name: "Points" }).closest("[data-slot='slide-content']") as HTMLElement;
    expect(content.style.getPropertyValue("--slide-fit")).toBe("1");
    expect(content).not.toHaveAttribute("data-fitted");
  });
});

describe("the sample deck (How DNS works, generated by the pipeline)", () => {
  test("is a valid deck by the schema and by the generation rules", () => {
    expect(deckSchema.safeParse(sample).success).toBe(true);
    expect(validateGeneratedDeck({ title: sample.title, slides: sample.slides })).toMatchObject({ ok: true });
  });

  test("renders every slide from the JSON alone", async () => {
    const user = userEvent.setup();
    const parsed = deckSchema.parse(sample);
    render(<SlideDeck deck={parsed} language="en" />);
    for (const [i, slide] of parsed.slides.entries()) {
      expect(counter()).toHaveTextContent(`${i + 1} / ${parsed.slides.length}`);
      expect(screen.getByRole("heading", { name: slide.title })).toBeInTheDocument();
      if (i < parsed.slides.length - 1) await user.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(mermaid.render).toHaveBeenCalledTimes(parsed.slides.filter((s) => s.visual?.type === "mermaid").length);
  });
});
