import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DeckEditor } from "./deck-editor";

const updateDeck = vi.fn();
const data: Record<string, unknown> = {};

vi.mock("@/components/admin/use-admin-query", () => ({
  useAdminQuery: (ref: { name: string }) => data[ref.name],
}));
vi.mock("convex/react", () => ({ useMutation: () => updateDeck }));
// The preview draws diagrams with Mermaid, which needs a real browser.
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg></svg>" })) } }));
vi.mock("../../../convex/_generated/api", () => ({
  api: { admin: { getDeck: { name: "getDeck" }, updateDeck: { name: "updateDeck" } } },
}));

const slides = Array.from({ length: 6 }, (_, i) => ({
  layout: "bullets",
  title: `S${i + 1}`,
  bullets: [`point ${i + 1}`],
  notes: `notes ${i + 1}`,
}));

beforeEach(() => {
  updateDeck.mockReset().mockResolvedValue(undefined);
  data.getDeck = { _id: "d1", slides };
});

describe("DeckEditor", () => {
  test("add, reorder and delete are reflected in the updateDeck payload", async () => {
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.click(screen.getByRole("button", { name: "Add slide" }));
    await user.click(screen.getByRole("button", { name: "Move slide 7 up" }));
    await user.click(screen.getByRole("button", { name: "Delete slide 1" }));
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    expect(updateDeck).toHaveBeenCalledTimes(1);
    const payload = updateDeck.mock.calls[0][0] as { chapterId: string; slides: { title: string }[] };
    expect(payload.chapterId).toBe("ch1");
    expect(payload.slides.map((s) => s.title)).toEqual(["S2", "S3", "S4", "S5", "New slide", "S6"]);
  });

  test("blocks saving fewer than 6 slides", async () => {
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.click(screen.getByRole("button", { name: "Delete slide 1" }));
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    expect(screen.getByRole("alert")).toHaveTextContent("6");
    expect(updateDeck).not.toHaveBeenCalled();
  });

  test("edits fields per layout, keeps content dir=auto and shows the preview", async () => {
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="he" />);
    expect(screen.getByLabelText("Title")).toHaveAttribute("dir", "auto");
    await user.selectOptions(screen.getByLabelText("Layout"), "quote");
    await user.type(screen.getByLabelText("Quote"), "Hello");
    expect(screen.getByText("Hello", { selector: "blockquote" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    const saved = updateDeck.mock.calls[0][0] as { slides: Record<string, unknown>[] };
    expect(saved.slides[0]).toMatchObject({ layout: "quote", quote: "Hello", title: "S1" });
    expect(saved.slides[0].bullets).toBeUndefined();
  });

  test("a generated slide keeps its id, visual and code through an edit of something else", async () => {
    const chart = { type: "chart", chartType: "bar", data: [{ label: "A", value: 1 }, { label: "B", value: 2 }] };
    const code = { language: "bash", content: "dig example.com" };
    data.getDeck = {
      _id: "d1",
      slides: [
        { id: "s1", layout: "bullets+visual", title: "S1", bullets: ["point"], visual: chart, notes: "n" },
        { id: "s2", layout: "code", title: "S2", code, notes: "n" },
        ...slides.slice(2),
      ],
    };
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.type(screen.getByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    const saved = updateDeck.mock.calls[0][0] as { slides: Record<string, unknown>[] };
    expect(saved.slides[0]).toEqual({ id: "s1", layout: "bullets+visual", title: "S1!", bullets: ["point"], visual: chart, notes: "n" });
    expect(saved.slides[1]).toEqual({ id: "s2", layout: "code", title: "S2", code, notes: "n" });
  });

  test("the visual is edited as JSON: only a value that passes the deck schema reaches the slide", async () => {
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.selectOptions(screen.getByLabelText("Layout"), "visual-full");
    const field = screen.getByLabelText("Visual (JSON)");
    // A new visual slide starts with a small diagram to edit.
    expect(JSON.parse((field as HTMLTextAreaElement).value)).toMatchObject({ type: "mermaid" });

    await user.clear(field);
    await user.type(field, "{{not json");
    expect(screen.getByRole("alert")).toHaveTextContent("Not valid JSON yet.");
    fireEvent.change(field, { target: { value: JSON.stringify({ type: "table", headers: ["A", "B"], rows: [["only one"]] }) } });
    expect(screen.getByRole("alert")).toHaveTextContent("table row 1 has 1 cells for 2 headers");
    const table = { type: "table", headers: ["Type", "Holds"], rows: [["A", "IPv4"]] };
    fireEvent.change(field, { target: { value: JSON.stringify(table) } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The preview draws it with the viewer's own component.
    expect(within(screen.getByLabelText("Slide preview")).getByRole("columnheader", { name: "Holds" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save deck" }));
    const saved = updateDeck.mock.calls[0][0] as { slides: Record<string, unknown>[] };
    expect(saved.slides[0]).toEqual({ layout: "visual-full", title: "S1", visual: table, notes: "notes 1" });
  });

  test("a code slide edits its language and source; a new slide gets an id of its own", async () => {
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.selectOptions(screen.getByLabelText("Layout"), "code");
    await user.clear(screen.getByLabelText("Language"));
    await user.type(screen.getByLabelText("Language"), "bash");
    await user.type(screen.getByLabelText("Code"), "dig example.com");
    await user.click(screen.getByRole("button", { name: "Add slide" }));
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    const saved = updateDeck.mock.calls[0][0] as { slides: Record<string, unknown>[] };
    expect(saved.slides[0]).toEqual({
      layout: "code",
      title: "S1",
      code: { language: "bash", content: "dig example.com" },
      bullets: ["point 1"],
      notes: "notes 1",
    });
    expect(saved.slides[6]).toMatchObject({ id: "slide-7", layout: "bullets", title: "New slide" });
  });

  test("shows the server's error detail", async () => {
    const { ConvexError } = await import("convex/values");
    updateDeck.mockRejectedValue(new ConvexError("INVALID: slide 2 notes is required"));
    const user = userEvent.setup();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    expect(await screen.findByText("INVALID: slide 2 notes is required")).toBeInTheDocument();
  });

  test("an agent can add a slide and save", async () => {
    const agent = createAgent();
    render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Add slide", "Save deck", "Title"]));
    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Add slide", action: "press" },
          { ref: "Save deck", action: "press" },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect((updateDeck.mock.calls[0][0] as { slides: unknown[] }).slides).toHaveLength(7);
  });

  test("paused while regenerating: Save is disabled with a notice", () => {
    render(<DeckEditor chapterId={"ch1" as never} language="en" paused />);
    expect(screen.getByText("Regenerating — editing is paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save deck" })).toBeDisabled();
  });

  test("a server change while clean refreshes to the server copy", () => {
    const { rerender } = render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    data.getDeck = { _id: "d1", slides: slides.map((s) => ({ ...s, title: `R-${s.title}` })) };
    rerender(<DeckEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByRole("button", { name: "Select slide 1" })).toHaveTextContent("R-S1");
    expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
  });

  test("a server change while dirty keeps edits, warns and blocks save until discarded", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.type(screen.getByLabelText("Title"), "!");
    data.getDeck = { _id: "d1", slides: slides.map((s) => ({ ...s, title: `R-${s.title}` })) };
    rerender(<DeckEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.getByText(/changed on the server/)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("S1!");
    expect(screen.getByRole("button", { name: "Save deck" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard my changes and reload" }));
    expect(screen.getByLabelText("Title")).toHaveValue("R-S1");
    expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
  });

  test("saving does not raise a false conflict while the server catches up", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeckEditor chapterId={"ch1" as never} language="en" />);
    await user.type(screen.getByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save deck" }));
    expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("S1!");
    data.getDeck = { _id: "d1", slides: [{ ...slides[0], title: "S1!" }, ...slides.slice(1)] };
    rerender(<DeckEditor chapterId={"ch1" as never} language="en" />);
    expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("S1!");
  });
});
