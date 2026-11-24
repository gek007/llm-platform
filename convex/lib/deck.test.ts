// @vitest-environment edge-runtime
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DECK_RULES,
  deckDraftSchema,
  deckSchema,
  deckTexts,
  generatedDeckProblems,
  mermaidStaticProblem,
  requiredVisuals,
  slideSchema,
  toBulletsFallback,
  validateGeneratedDeck,
  validateSlideData,
  withSlideIds,
  type Deck,
  type DeckSlide,
  type RenderableDeck,
} from "./deck";
import type { Slide as StoredSlide } from "./engineTypes";

const notes = "Explain the slide in two sentences. Then move on.";
const diagram = { type: "mermaid" as const, code: "flowchart LR\n  A[Ask] --> B[Answer]", caption: "The flow" };
const chart = { type: "chart" as const, chartType: "bar" as const, data: [{ label: "A", value: 1 }, { label: "B", value: 2 }] };
const table = { type: "table" as const, headers: ["Type", "Holds"], rows: [["A", "IPv4 address"], ["AAAA", "IPv6 address"]] };

/** A 10-slide deck that meets every rule, with 4 visuals (40%). */
function validDeck(): { title: string; slides: DeckSlide[] } {
  return {
    title: "How DNS works",
    slides: [
      { id: "s1", layout: "title", title: "How DNS works", bullets: ["From a name to an address"], notes },
      { id: "s2", layout: "bullets", title: "Why names", bullets: ["People remember names", "Machines route by number"], notes },
      { id: "s3", layout: "bullets+visual", title: "The lookup", bullets: ["Ask the resolver"], visual: diagram, notes },
      { id: "s4", layout: "visual-full", title: "Record types", visual: table, notes },
      { id: "s5", layout: "two-column", title: "Recursive and authoritative", left: ["Asks on your behalf"], right: ["Holds the answer"], notes },
      { id: "s6", layout: "code", title: "Try it", code: { language: "bash", content: "dig example.com A +short" }, notes },
      { id: "s7", layout: "visual-full", title: "Lookup time", visual: chart, notes },
      { id: "s8", layout: "quote", title: "In one line", quote: "The phone book of the internet.", attribution: "A common description", notes },
      { id: "s9", layout: "bullets+visual", title: "Caching", bullets: ["Answers live for their TTL"], visual: { type: "image_prompt", prompt: "A stopwatch next to a cache", alt: "A cache with a timer" }, notes },
      { id: "s10", layout: "summary", title: "Key takeaways", bullets: ["Names map to addresses", "Resolvers cache answers"], notes },
    ],
  };
}

const errorsOf = (data: unknown) => {
  const result = validateGeneratedDeck(data);
  return result.ok ? [] : result.errors;
};
const withSlide = (i: number, patch: Partial<DeckSlide>) => {
  const deck = validDeck();
  deck.slides[i] = { ...deck.slides[i], ...patch };
  return deck;
};

describe("deck schema", () => {
  it("accepts a deck that uses every layout and every visual type", () => {
    const result = validateGeneratedDeck(validDeck());
    expect(result).toMatchObject({ ok: true });
    expect(deckSchema.safeParse({ chapterId: "chapter-1", ...validDeck() }).success).toBe(true);
    expect(deckSchema.safeParse(validDeck()).success).toBe(false); // chapterId is required on the full deck
  });

  it("trims strings and drops unknown keys, so no markup field can ride along", () => {
    const deck = validDeck();
    const parsed = deckDraftSchema.parse({
      ...deck,
      slides: deck.slides.map((s, i) => (i === 1 ? { ...s, title: "  Why names  ", html: "<b>x</b>" } : s)),
    });
    expect(parsed.slides[1].title).toBe("Why names");
    expect(parsed.slides[1]).not.toHaveProperty("html");
  });

  it("needs 8-15 slides", () => {
    const deck = validDeck();
    expect(errorsOf({ ...deck, slides: deck.slides.slice(0, 7) }).join()).toMatch(/slides/);
    const extra = Array.from({ length: 6 }, (_, i) => ({ ...deck.slides[1], id: `x${i}` }));
    const long = [...deck.slides.slice(0, 9), ...extra, deck.slides[9]];
    expect(long).toHaveLength(16);
    expect(validateGeneratedDeck({ ...deck, slides: long }).ok).toBe(false);
    expect(DECK_RULES).toMatchObject({ minSlides: 8, maxSlides: 15 });
  });

  it("the first slide is a title and the last a summary", () => {
    expect(errorsOf(withSlide(0, { layout: "bullets" }))).toContain(
      'slide 1 (s1) layout: the first slide must use the "title" layout',
    );
    expect(errorsOf(withSlide(9, { layout: "bullets" }))).toContain(
      'slide 10 (s10) layout: the last slide must use the "summary" layout',
    );
  });

  it("slide ids are unique lowercase slugs", () => {
    expect(errorsOf(withSlide(4, { id: "s2" }))).toContain('slide 5 (s2) id: slide id "s2" is used twice');
    expect(errorsOf(withSlide(4, { id: "Slide 5" })).join()).toMatch(/id is a short lowercase slug/);
  });

  it("at most 5 bullets, each at most 16 words", () => {
    expect(validateGeneratedDeck(withSlide(1, { bullets: ["1", "2", "3", "4", "5"] })).ok).toBe(true);
    expect(validateGeneratedDeck(withSlide(1, { bullets: ["1", "2", "3", "4", "5", "6"] })).ok).toBe(false);
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    expect(validateGeneratedDeck(withSlide(1, { bullets: [words(16)] })).ok).toBe(true);
    expect(errorsOf(withSlide(1, { bullets: [words(17)] }))).toEqual([
      "slide 2 (s2) bullets 1: a bullet has at most 16 words (aim for under 12)",
    ]);
    expect(validateGeneratedDeck(withSlide(4, { left: [words(17)] })).ok).toBe(false);
  });

  it("each layout needs its fields and refuses fields it does not show", () => {
    const problems = (slide: unknown) => {
      const result = validateSlideData(slide);
      return result.ok ? [] : result.errors;
    };
    const base = { id: "s2", title: "T", notes };
    expect(problems({ ...base, layout: "bullets" })).toEqual(["a bullets slide needs bullets"]);
    expect(problems({ ...base, layout: "summary" })).toEqual(["a summary slide needs bullets"]);
    expect(problems({ ...base, layout: "bullets+visual", bullets: ["a"] })).toEqual(["a bullets+visual slide needs visual"]);
    expect(problems({ ...base, layout: "visual-full" })).toEqual(["a visual-full slide needs visual"]);
    expect(problems({ ...base, layout: "two-column", left: ["a"] })).toEqual(["a two-column slide needs right"]);
    expect(problems({ ...base, layout: "code" })).toEqual(["a code slide needs code"]);
    expect(problems({ ...base, layout: "quote" })).toEqual(["a quote slide needs quote"]);
    expect(problems({ ...base, layout: "bullets", bullets: ["a"], visual: chart })).toEqual([
      "a bullets slide does not show visual (use bullets+visual or visual-full)",
    ]);
    expect(problems({ ...base, layout: "bullets", bullets: ["a"], code: { language: "ts", content: "x" } })).toEqual([
      "a bullets slide does not show code (use the code layout)",
    ]);
    expect(problems({ ...base, layout: "title", bullets: ["a", "b"] })).toEqual([
      "a title slide takes at most one bullet (the subtitle)",
    ]);
    expect(problems({ ...base, layout: "code", code: { language: "ts", content: "x" }, bullets: ["note"] })).toEqual([]);
    expect(problems({ ...base, layout: "bullets", bullets: ["a"] })).toEqual([]);
    expect(problems({ ...base, layout: "bullets", bullets: ["a"], notes: " " }).join()).toMatch(/notes/);
  });

  it("checks visuals: table widths, chart points, pie values, unknown types", () => {
    const visual = (v: unknown) => slideSchema.safeParse({ id: "s2", title: "T", layout: "visual-full", visual: v, notes });
    expect(visual(table).success).toBe(true);
    expect(visual({ ...table, rows: [["only one cell"]] }).success).toBe(false);
    expect(visual({ ...table, headers: ["One"] , rows: [["x"]] }).success).toBe(false);
    expect(visual({ ...chart, data: [{ label: "A", value: 1 }] }).success).toBe(false);
    expect(visual({ ...chart, chartType: "radar" }).success).toBe(false);
    expect(visual({ ...chart, chartType: "pie", data: [{ label: "A", value: -1 }, { label: "B", value: 2 }] }).success).toBe(false);
    expect(visual({ ...chart, chartType: "pie", data: [{ label: "A", value: 0 }, { label: "B", value: 0 }] }).success).toBe(false);
    expect(visual({ ...chart, data: [{ label: "A", value: "1" }, { label: "B", value: 2 }] }).success).toBe(false);
    const points = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `P${i}`, value: i + 1 }));
    expect(visual({ ...chart, chartType: "pie", data: points(6) }).success).toBe(true);
    expect(visual({ ...chart, chartType: "pie", data: points(7) }).success).toBe(false);
    expect(visual({ ...chart, chartType: "bar", data: points(12) }).success).toBe(true);
    expect(visual({ type: "image_prompt", prompt: "A globe" }).success).toBe(false);
    expect(visual({ type: "image", url: "https://example.com/x.png" }).success).toBe(false);
    expect(visual({ type: "html", html: "<svg/>" }).success).toBe(false);
  });

  it("caps slide code at 18 lines", () => {
    const code = (content: string) =>
      slideSchema.safeParse({ id: "s2", title: "T", layout: "code", code: { language: "bash", content }, notes }).success;
    expect(code(Array.from({ length: 18 }, (_, i) => `echo ${i}`).join("\n"))).toBe(true);
    expect(code(Array.from({ length: 19 }, (_, i) => `echo ${i}`).join("\n"))).toBe(false);
    expect(code("   ")).toBe(false);
  });

  it("mermaid: static checks refuse directives, click handlers and empty diagrams", () => {
    expect(mermaidStaticProblem("flowchart LR\n  A --> B")).toBeNull();
    expect(mermaidStaticProblem("%%{init: {'theme':'forest'}}%%\nflowchart LR\n  A --> B")).toMatch(/init/);
    expect(mermaidStaticProblem('flowchart LR\n  A --> B\n  click A "https://x.example"')).toMatch(/click/);
    expect(mermaidStaticProblem("flowchart LR")).toMatch(/no content/);
    expect(mermaidStaticProblem("---\ntitle: x\n---\nflowchart LR\n  A --> B")).toMatch(/front matter/);
  });
});

describe("generation-only rule: 40% of slides carry a visual", () => {
  it("rounds the requirement up", () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map(requiredVisuals)).toEqual([4, 4, 4, 5, 5, 6, 6, 6]);
  });

  it("rejects a generated deck with too few visuals but the schema itself still accepts it", () => {
    const deck = withSlide(6, { layout: "bullets", bullets: ["No chart here"], visual: undefined });
    expect(deck.slides.filter((s) => s.visual).length).toBe(3);
    expect(deckDraftSchema.safeParse(deck).success).toBe(true);
    const errors = errorsOf(deck);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^only 3 of 10 slides have a visual; at least 4 must \(40%\)/);
    expect(generatedDeckProblems(validDeck())).toEqual([]);
  });
});

describe("toBulletsFallback", () => {
  it("keeps the slide's bullets and drops the visual", () => {
    const slide = validDeck().slides[2];
    expect(toBulletsFallback(slide)).toEqual({ id: "s3", title: "The lookup", layout: "bullets", bullets: ["Ask the resolver"], notes });
  });

  it("builds bullets for a visual-full slide from its caption and notes, and the result is a valid slide", () => {
    const long = "This first sentence of the speaker notes is deliberately far too long to fit on a slide as one single bullet point for learners. Short one.";
    const slide: DeckSlide = { id: "s4", layout: "visual-full", title: "The lookup", visual: diagram, notes: long };
    const fallback = toBulletsFallback(slide);
    expect(fallback.layout).toBe("bullets");
    expect(fallback.visual).toBeUndefined();
    expect(fallback.bullets).toEqual([
      "The flow",
      "This first sentence of the speaker notes is deliberately far too long to fit on…",
      "Short one.",
    ]);
    expect(validateSlideData(fallback)).toMatchObject({ ok: true });
  });
});

describe("stored decks", () => {
  it("withSlideIds gives older slides ids and keeps ids unique", () => {
    const stored: StoredSlide[] = [
      { layout: "title", title: "A", notes: "n" },
      { id: "intro", layout: "bullets", title: "B", bullets: ["x"], notes: "n" },
      { id: "intro", layout: "bullets", title: "C", bullets: ["x"], notes: "n" },
    ];
    expect(withSlideIds(stored).map((s) => s.id)).toEqual(["slide-1", "intro", "intro-3"]);
  });

  it("a schema slide is a storable slide, and a schema deck is a renderable deck", () => {
    expectTypeOf<DeckSlide>().toExtend<StoredSlide>();
    expectTypeOf<Deck>().toExtend<RenderableDeck>();
  });

  it("deckTexts lists every learner-visible string except slide code", () => {
    const texts = deckTexts(validDeck().slides, "How DNS works");
    expect(texts).toContain("How DNS works");
    expect(texts).toContain(diagram.code);
    expect(texts).toContain("IPv6 address");
    expect(texts).toContain("A cache with a timer");
    expect(texts).toContain("The phone book of the internet.");
    expect(texts).not.toContain("dig example.com A +short");
  });
});
