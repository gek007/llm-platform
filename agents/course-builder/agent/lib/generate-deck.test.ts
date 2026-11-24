// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { DeckDraft, DeckSlide } from "../../../../convex/lib/deck";
import { fakeDeck } from "../../../../src/lib/course-builder/fake-deck";
import {
  generateDeck,
  MAX_DECK_RETRIES,
  MAX_DIAGRAM_REPAIRS,
  type AskResult,
  type DeckDeps,
} from "./generate-deck";
import { mermaidProblem } from "./mermaid-validate";

const GOOD = "flowchart LR\n  A[Ask] --> B[Answer]";
const BROKEN = "flowchart LR\n  A[Ask --> B{Answer";

/** A valid 10-slide deck with 4 visuals; slide s3 carries the only Mermaid diagram. */
const deck = (patch: (slides: DeckSlide[]) => void = () => {}): DeckDraft => {
  const slides = fakeDeck("Chapter one");
  patch(slides);
  return { title: "Chapter one", slides };
};
const withDiagram = (code: string) =>
  deck((slides) => {
    slides[2] = { ...slides[2], visual: { type: "mermaid", code, caption: "The loop" } };
  });

type Turn = { message: string; expect: "deck" | "slide" };

/**
 * Deps with a scripted model: each `ask` takes the next answer. The diagram check is the real
 * Mermaid parser unless a test replaces it; `save` accepts unless told otherwise.
 */
function harness(answers: (AskResult | unknown)[], over: Partial<DeckDeps> = {}) {
  const turns: Turn[] = [];
  const warnings: string[] = [];
  const queue = [...answers];
  const deps: DeckDeps = {
    ask: vi.fn(async (message, expect) => {
      turns.push({ message, expect });
      if (queue.length === 0) throw new Error("the model was asked more often than the test scripted");
      const next = queue.shift();
      const isResult = typeof next === "object" && next !== null && "ok" in next;
      return isResult ? (next as AskResult) : { ok: true as const, data: next };
    }),
    checkDiagrams: vi.fn(async (codes: string[]) => ({
      ok: true as const,
      problems: await Promise.all(codes.map((code) => mermaidProblem(code))),
    })),
    save: vi.fn(async () => ({ ok: true as const })),
    warn: (message) => void warnings.push(message),
    ...over,
  };
  return { deps, turns, warnings };
}

describe("generateDeck: schema validation and retries", () => {
  test("a valid first answer is saved after one model call", async () => {
    const { deps, turns, warnings } = harness([deck()]);
    const out = await generateDeck("BRIEF", deps);
    expect(out).toMatchObject({ ok: true, attempts: 1, repaired: [], fellBack: [] });
    expect(turns).toEqual([{ message: "BRIEF", expect: "deck" }]);
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.save).toHaveBeenCalledWith(deck());
    expect(warnings).toEqual([]);
  });

  test("an invalid deck is retried with the validation errors fed back", async () => {
    const bad = deck((slides) => {
      slides[0] = { ...slides[0], layout: "bullets", bullets: ["Not a title"] };
      slides[1] = { ...slides[1], bullets: ["1", "2", "3", "4", "5", "6"] };
    });
    const { deps, turns } = harness([bad, deck()]);
    const out = await generateDeck("BRIEF", deps);
    expect(out).toMatchObject({ ok: true, attempts: 2 });
    expect(turns).toHaveLength(2);
    expect(turns[1].expect).toBe("deck");
    expect(turns[1].message).toMatch(/^Your deck did not pass validation\. Fix every problem below and return the complete corrected deck/);
    expect(turns[1].message).toContain('- slide 1 (s1) layout: the first slide must use the "title" layout');
    expect(turns[1].message).toMatch(/- slide 2 \(s2\) bullets: /);
    expect(deps.save).toHaveBeenCalledTimes(1); // the invalid deck was never saved
  });

  test("too few visuals is a validation error, with the count in the feedback", async () => {
    const sparse = deck((slides) => {
      slides[4] = { id: "s5", layout: "bullets", title: "No chart", bullets: ["Text only"], notes: slides[4].notes };
    });
    const { deps, turns } = harness([sparse, deck()]);
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true, attempts: 2 });
    expect(turns[1].message).toContain("- only 3 of 10 slides have a visual; at least 4 must (40%)");
  });

  test("something that is not a deck at all is retried too", async () => {
    const { deps, turns } = harness([undefined, "<div>slides</div>", deck()]);
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true, attempts: 3 });
    expect(turns).toHaveLength(3);
  });

  test(`gives up after ${MAX_DECK_RETRIES} retries and reports the last errors`, async () => {
    const bad = deck((slides) => slides.splice(1, 4)); // 6 slides
    const { deps, turns } = harness([bad, bad, bad, deck()]);
    const out = await generateDeck("BRIEF", deps);
    expect(turns).toHaveLength(1 + MAX_DECK_RETRIES); // the 4th answer is never asked for
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ attempts: 3 });
    expect(!out.ok && out.reason).toMatch(/^the deck was not accepted after 2 retries: slides: /);
    expect(deps.save).not.toHaveBeenCalled();
  });

  test("a failed model call uses up an attempt and repeats the same message", async () => {
    const { deps, turns } = harness([{ ok: false, error: "model overloaded" }, deck()]);
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true, attempts: 2 });
    expect(turns.map((t) => t.message)).toEqual(["BRIEF", "BRIEF"]);
  });

  test("a cancelled turn stops at once", async () => {
    const { deps, turns } = harness([{ ok: false, error: "the deck writer was cancelled", fatal: true }, deck()]);
    expect(await generateDeck("BRIEF", deps)).toEqual({ ok: false, reason: "the deck writer was cancelled", attempts: 1 });
    expect(turns).toHaveLength(1);
  });
});

describe("generateDeck: engine refusals", () => {
  test("a refused save is fed back and the corrected deck saved", async () => {
    const save = vi
      .fn<DeckDeps["save"]>()
      .mockResolvedValueOnce({ ok: false, message: "Unknown reference: https://evil.example/x" })
      .mockResolvedValue({ ok: true });
    const { deps, turns } = harness([deck(), deck()], { save });
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true, attempts: 2 });
    expect(turns[1].message).toMatch(/^The platform refused your deck\./);
    expect(turns[1].message).toContain("- Unknown reference: https://evil.example/x");
    expect(save).toHaveBeenCalledTimes(2);
  });

  test("BAD_STATE and NOT_FOUND are not retried", async () => {
    for (const message of ["BAD_STATE: Course is published; unpublish it to let the engine write", "NOT_FOUND: chapter 9"]) {
      const { deps, turns } = harness([deck(), deck()], { save: vi.fn(async () => ({ ok: false as const, message })) });
      expect(await generateDeck("BRIEF", deps)).toEqual({ ok: false, reason: message, attempts: 1 });
      expect(turns).toHaveLength(1);
    }
  });

  test("refusals share the retry budget with validation errors", async () => {
    const save = vi.fn(async () => ({ ok: false as const, message: "INVALID: slide 2 (s2) title: too long" }));
    const { deps, turns } = harness([deck(), deck(), deck()], { save });
    const out = await generateDeck("BRIEF", deps);
    expect(turns).toHaveLength(3);
    expect(out).toEqual({
      ok: false,
      reason: "the deck was not accepted after 2 retries: INVALID: slide 2 (s2) title: too long",
      attempts: 3,
    });
  });
});

describe("generateDeck: Mermaid diagrams", () => {
  test("an invalid diagram re-asks only that slide, with the parser's error, and the fix is kept", async () => {
    const repairedSlide = { ...withDiagram(GOOD).slides[2], id: "something-else" };
    const { deps, turns, warnings } = harness([withDiagram(BROKEN), repairedSlide]);
    const out = await generateDeck("BRIEF", deps);

    expect(out).toMatchObject({ ok: true, attempts: 1, repaired: ["s3"], fellBack: [] });
    expect(turns.map((t) => t.expect)).toEqual(["deck", "slide"]);
    const repair = turns[1].message;
    expect(repair).toMatch(/^The Mermaid diagram on slide "s3" \(How the parts fit together\) is not valid:/);
    expect(repair).toMatch(/mermaid: Parse error on line 2/);
    expect(repair).toContain(BROKEN);
    expect(repair).toContain('Return only this one slide, corrected, as a single slide object with the id "s3"');
    // The saved deck has the fixed diagram, under the slide's own id; the other slides are untouched.
    const saved = vi.mocked(deps.save).mock.calls[0][0];
    expect(saved.slides[2]).toEqual({ ...repairedSlide, id: "s3" });
    expect(saved.slides.filter((_, i) => i !== 2)).toEqual(deck().slides.filter((_, i) => i !== 2));
    expect(warnings).toEqual([]);
  });

  test("still invalid after the retry: the slide falls back to bullets without the visual", async () => {
    const { deps, turns, warnings } = harness([withDiagram(BROKEN), withDiagram(BROKEN).slides[2]]);
    const out = await generateDeck("BRIEF", deps);

    expect(turns).toHaveLength(1 + MAX_DIAGRAM_REPAIRS);
    expect(out).toMatchObject({ ok: true, attempts: 1, repaired: [], fellBack: ["s3"] });
    const saved = vi.mocked(deps.save).mock.calls[0][0];
    expect(saved.slides[2]).toEqual({
      id: "s3",
      layout: "bullets",
      title: "How the parts fit together",
      bullets: ["Start from the question", "Work through each step", "Check the result"],
      notes: deck().slides[2].notes,
    });
    expect(saved.slides).toHaveLength(10);
    // The deck is saved although it now has 3 visuals of 10: the 40% rule is for the model's answer only.
    expect(saved.slides.filter((s) => s.visual).length).toBe(3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^The diagram on slide "s3" \(How the parts fit together\) stayed invalid after a retry and was replaced with bullets: mermaid: Parse error/);
  });

  test("a repair that is not a valid slide, or a failed repair call, also falls back", async () => {
    for (const answer of [{ id: "s3", title: "Only a title" }, { ok: false, error: "model overloaded" }, null]) {
      const { deps } = harness([withDiagram(BROKEN), answer]);
      const out = await generateDeck("BRIEF", deps);
      expect(out).toMatchObject({ ok: true, fellBack: ["s3"] });
      expect(vi.mocked(deps.save).mock.calls[0][0].slides[2]).toMatchObject({ layout: "bullets" });
    }
  });

  test("a repair may swap the diagram for another visual", async () => {
    const asTable: DeckSlide = {
      ...withDiagram(BROKEN).slides[2],
      visual: { type: "table", headers: ["Step", "What happens"], rows: [["1", "Ask"], ["2", "Answer"]] },
    };
    const { deps } = harness([withDiagram(BROKEN), asTable]);
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true, repaired: ["s3"], fellBack: [] });
    expect(vi.mocked(deps.save).mock.calls[0][0].slides[2].visual).toMatchObject({ type: "table" });
  });

  test("two broken diagrams are repaired one slide at a time; valid ones are never re-asked", async () => {
    const two = withDiagram(BROKEN);
    two.slides[4] = { ...two.slides[4], visual: { type: "mermaid", code: "sequenceDiagram\n  A->>B query" } };
    const fixedFirst = withDiagram(GOOD).slides[2];
    const { deps, turns } = harness([two, fixedFirst, { ...two.slides[4] }]);
    const out = await generateDeck("BRIEF", deps);
    expect(out).toMatchObject({ ok: true, repaired: ["s3"], fellBack: ["s5"] });
    expect(turns.map((t) => t.expect)).toEqual(["deck", "slide", "slide"]);
    expect(turns[1].message).toContain('slide "s3"');
    expect(turns[2].message).toContain('slide "s5"');
  });

  test("when the parser itself is unavailable the diagrams are kept and the admin is told", async () => {
    const checkDiagrams = vi.fn(async () => ({ ok: false as const, error: "Cannot find module 'mermaid'" }));
    const { deps, turns, warnings } = harness([withDiagram(BROKEN)], { checkDiagrams });
    const out = await generateDeck("BRIEF", deps);
    expect(out).toMatchObject({ ok: true, repaired: [], fellBack: [] });
    expect(turns).toHaveLength(1);
    expect(warnings).toEqual(["Diagram syntax could not be checked (Cannot find module 'mermaid'); the diagrams were kept unchecked"]);
  });

  test("a deck without Mermaid diagrams never calls the parser", async () => {
    const noDiagram = deck((slides) => {
      slides[2] = { ...slides[2], visual: { type: "table", headers: ["A", "B"], rows: [["1", "2"]] } };
    });
    const { deps } = harness([noDiagram]);
    expect(await generateDeck("BRIEF", deps)).toMatchObject({ ok: true });
    expect(deps.checkDiagrams).not.toHaveBeenCalled();
  });
});
