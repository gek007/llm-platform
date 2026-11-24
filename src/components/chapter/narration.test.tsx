import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withSlideIds, type RenderableDeck } from "../../../convex/lib/deck";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import { SlideDeck } from "./slide-deck";
import { narrationChunks, pickVoice } from "./use-narration";

const slides: SlideData[] = [
  { layout: "title", title: "Intro", notes: "Welcome to the chapter. Today we follow one name." },
  { layout: "bullets", title: "Points", bullets: ["One"], notes: "Here is the main point." },
  { layout: "summary", title: "Wrap", bullets: ["Done"], notes: "That is all." },
];
const deck: RenderableDeck = { chapterId: "ch1", title: "Deck", slides: withSlideIds(slides) };

type Voice = { lang: string; name: string; default: boolean };
type Spoken = { text: string; lang: string; voice: string | undefined; end: () => void; fail: (error: string) => void };

/** jsdom has no Web Speech API: a stand-in that records what is spoken and lets a test end it. */
function installSpeech(voices: Voice[]) {
  const spoken: Spoken[] = [];
  const synth = {
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: (u: { text: string; lang: string; voice: Voice | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }) =>
      spoken.push({
        text: u.text,
        lang: u.lang,
        voice: u.voice?.name,
        end: () => act(() => u.onend?.()),
        fail: (error) => act(() => u.onerror?.({ error })),
      }),
  };
  class Utterance {
    lang = "";
    voice: Voice | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  return { spoken, synth };
}

const english: Voice[] = [
  { lang: "en-GB", name: "Daniel", default: false },
  { lang: "en-US", name: "Samantha", default: true },
  { lang: "ru-RU", name: "Milena", default: false },
];
const counter = () => screen.getByText(/^\d+ \/ \d+$/);
const listen = () => screen.getByRole("button", { name: "Listen" });
const caption = () => document.querySelector("[data-slot='narration-caption']");

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("narration with the browser's voice", () => {
  test("without the speech API the deck shows no narration controls", () => {
    render(<SlideDeck deck={deck} language="en" />);
    expect(screen.queryByRole("button", { name: "Listen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auto-advance" })).not.toBeInTheDocument();
  });

  test("Listen reads the slide's notes sentence by sentence, in the course language, with a caption", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    expect(caption()).toBeNull();
    await user.click(listen());

    expect(listen()).toHaveAttribute("aria-pressed", "true");
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: "Welcome to the chapter.", lang: "en-US", voice: "Samantha" });
    expect(caption()).toHaveTextContent("Welcome to the chapter.");
    spoken[0].end();
    expect(spoken[1].text).toBe("Today we follow one name.");
    expect(caption()).toHaveTextContent("Today we follow one name.");
    expect(counter()).toHaveTextContent("1 / 3");
  });

  test("when a slide's notes end, the deck moves on and keeps reading, and stops after the last slide", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    await user.click(listen());
    spoken[0].end();
    spoken[1].end();
    expect(counter()).toHaveTextContent("2 / 3");
    expect(spoken[2].text).toBe("Here is the main point.");
    spoken[2].end();
    expect(counter()).toHaveTextContent("3 / 3");
    expect(spoken[3].text).toBe("That is all.");
    spoken[3].end();
    expect(spoken).toHaveLength(4);
    expect(listen()).toHaveAttribute("aria-pressed", "false");
    expect(caption()).toBeNull();
    expect(counter()).toHaveTextContent("3 / 3");
  });

  test("with Auto-advance off, narration stops at the end of the slide", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    expect(screen.getByRole("button", { name: "Auto-advance" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Auto-advance" }));
    await user.click(listen());
    spoken[0].end();
    spoken[1].end();
    expect(counter()).toHaveTextContent("1 / 3");
    expect(spoken).toHaveLength(2);
    expect(listen()).toHaveAttribute("aria-pressed", "false");
  });

  test("changing slide while listening cuts the sentence off and reads the new slide", async () => {
    const user = userEvent.setup();
    const { spoken, synth } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    await user.click(listen());
    synth.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken.at(-1)?.text).toBe("Here is the main point.");
    // The cut-off sentence reports its end late: that must not advance or restart anything.
    spoken[0].end();
    spoken[0].fail("interrupted");
    expect(counter()).toHaveTextContent("2 / 3");
    expect(spoken.at(-1)?.text).toBe("Here is the main point.");
    expect(listen()).toHaveAttribute("aria-pressed", "true");
  });

  test("stopping and listening again resumes from the interrupted sentence", async () => {
    const user = userEvent.setup();
    const { spoken, synth } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    await user.click(listen());
    spoken[0].end();
    synth.cancel.mockClear();
    await user.click(listen());
    expect(synth.cancel).toHaveBeenCalled();
    expect(listen()).toHaveAttribute("aria-pressed", "false");
    expect(caption()).toBeNull();
    await user.click(listen());
    expect(spoken.at(-1)?.text).toBe("Today we follow one name.");
  });

  test("the overview pauses narration and closing it resumes", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    await user.click(listen());
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(caption()).toBeNull();
    const before = spoken.length;
    await user.click(screen.getByRole("button", { name: "Slide 2: Points" }));
    expect(spoken.length).toBe(before + 1);
    expect(spoken.at(-1)?.text).toBe("Here is the main point.");
  });

  test("a device without a voice for the course language says so and reads nothing", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="he" />);
    await user.click(listen());
    expect(spoken).toHaveLength(0);
    expect(listen()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("This device has no Hebrew voice");
  });

  test("a Russian deck is read with the Russian voice", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="ru" />);
    await user.click(listen());
    expect(spoken[0]).toMatchObject({ lang: "ru-RU", voice: "Milena" });
  });

  test("the Voice picker lists this language's voices, best first, and the choice is used and remembered", async () => {
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    const { unmount } = render(<SlideDeck deck={deck} language="en" />);
    const picker = screen.getByRole("combobox", { name: "Voice" });
    // Only English voices, the expected region first; the Russian voice is not offered.
    expect(Array.from(picker.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Samantha (en-US)", "Daniel (en-GB)"]);
    expect(picker).toHaveValue("Samantha");

    await user.click(listen());
    expect(spoken[0].voice).toBe("Samantha");
    // Changing the voice while listening reads the same sentence again in the new voice.
    await user.selectOptions(picker, "Daniel");
    expect(spoken.at(-1)).toMatchObject({ text: "Welcome to the chapter.", voice: "Daniel", lang: "en-GB" });
    expect(window.localStorage.getItem("learnly.deck.voice.en")).toBe("Daniel");

    unmount();
    render(<SlideDeck deck={deck} language="en" />);
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveValue("Daniel");
  });

  test("a remembered voice the device no longer has falls back to the best one; one voice needs no picker", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("learnly.deck.voice.en", "A voice from another computer");
    const { spoken } = installSpeech(english);
    const { unmount } = render(<SlideDeck deck={deck} language="en" />);
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveValue("Samantha");
    await user.click(listen());
    expect(spoken[0].voice).toBe("Samantha");
    unmount();
    // Russian has a single voice on this device: nothing to choose.
    render(<SlideDeck deck={deck} language="ru" />);
    expect(screen.queryByRole("combobox", { name: "Voice" })).not.toBeInTheDocument();
  });

  test("a speech error stops narration and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    const { spoken } = installSpeech(english);
    render(<SlideDeck deck={deck} language="en" />);
    await user.click(listen());
    spoken[0].fail("synthesis-failed");
    expect(listen()).toHaveAttribute("aria-pressed", "false");
    expect(warn).toHaveBeenCalledWith("[SlideDeck] narration stopped: synthesis-failed");
  });

  test("an agent can find and use the narration controls", async () => {
    const { spoken } = installSpeech(english);
    const agent = createAgent();
    render(<SlideDeck deck={deck} language="en" />);
    const labels = agent
      .snapshot()
      .filter((e) => !e.offPage)
      .map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Listen", "Auto-advance"]));
    await act(async () => {
      const result = await agent.act({ steps: [{ ref: "Listen", action: "setPressed", args: [true] }] });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(spoken[0].text).toBe("Welcome to the chapter.");
  });
});

describe("pickVoice", () => {
  const voice = (lang: string, name: string, isDefault = false) => ({ lang, name, default: isDefault });

  test("prefers the expected region, then a higher-quality voice, then the default", () => {
    expect(pickVoice([voice("en-GB", "Daniel"), voice("en-US", "Samantha")], "en")?.name).toBe("Samantha");
    expect(pickVoice([voice("en-US", "Fred"), voice("en-US", "Google US English")], "en")?.name).toBe("Google US English");
    expect(pickVoice([voice("ru-RU", "Yuri"), voice("ru-RU", "Milena", true)], "ru")?.name).toBe("Milena");
    expect(pickVoice([voice("en-AU", "Karen")], "en")?.name).toBe("Karen");
  });

  test("finds Hebrew under both of its language codes, and underscore tags", () => {
    expect(pickVoice([voice("iw-IL", "Hebrew Israel")], "he")?.name).toBe("Hebrew Israel");
    expect(pickVoice([voice("he_IL", "Carmit")], "he")?.name).toBe("Carmit");
  });

  test("returns null when the device has no voice for the language", () => {
    expect(pickVoice([voice("en-US", "Samantha"), voice("hr-HR", "Lana")], "he")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });
});

describe("narrationChunks", () => {
  test("splits notes into sentences", () => {
    expect(narrationChunks("First one. Second one! Third?")).toEqual(["First one.", "Second one!", "Third?"]);
    expect(narrationChunks("  ")).toEqual([]);
    expect(narrationChunks("No full stop")).toEqual(["No full stop"]);
  });

  test("splits a very long sentence at its commas, so no chunk runs long", () => {
    const clause = "this clause is about forty characters long";
    const long = `${Array.from({ length: 8 }, () => clause).join(", ")}.`;
    const chunks = narrationChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(220);
    expect(chunks.join(" ")).toBe(long);
  });
});
