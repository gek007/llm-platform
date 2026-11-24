import {
  toBulletsFallback,
  validateGeneratedDeck,
  validateSlideData,
  type DeckDraft,
  type DeckSlide,
} from "../../../../convex/lib/deck";

/**
 * The deck pipeline for one chapter: ask the model for the deck as JSON, validate it, retry on
 * failure, check every diagram, repair or drop the broken ones, save.
 *
 *   brief → model (deck JSON) → schema + rules ─ok→ diagrams ─ok→ save ─ok→ done
 *                 ↑                  │ invalid         │ invalid      │ refused
 *                 └── errors fed back┘ (≤ 2 retries)   │              └→ fed back like a
 *                                                      ▼                 validation error
 *                              one slide re-asked with the parser's error
 *                              (≤ 1 repair per slide); still invalid →
 *                              the slide falls back to `bullets`, no visual
 *
 * Pure: the model, the diagram parser and the engine come in as `deps`, so the retry and fallback
 * logic is tested without any of them (generate-deck.test.ts) and stays deterministic inside the
 * workflow (write-chapters.ts wires the real ones).
 */

/** Whole-deck retries after the first attempt, each with the validation errors fed back. */
export const MAX_DECK_RETRIES = 2;
/** Single-slide retries for a diagram that does not parse, before the slide falls back to bullets. */
export const MAX_DIAGRAM_REPAIRS = 1;

/** A diagram check's result; `ok: false` when the parser itself could not run. */
export type DiagramCheck = { ok: true; problems: (string | null)[] } | { ok: false; error: string };

export type AskResult =
  | { ok: true; data: unknown }
  /** `fatal`: do not ask again (the turn was cancelled). */
  | { ok: false; error: string; fatal?: boolean };

export type DeckDeps = {
  /** One turn of the deck writer's conversation, answered as JSON in the shape `expect` names. */
  ask(message: string, expect: "deck" | "slide"): Promise<AskResult>;
  /** Syntax-checks diagrams; `problems[i]` is null when `codes[i]` is valid. */
  checkDiagrams(codes: string[]): Promise<DiagramCheck>;
  /** Stores the deck. A refusal carries the engine's "CODE: detail" or "Unknown reference: …". */
  save(deck: DeckDraft): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Something the admin should see in the job's activity feed (a fallback, an unavailable check). */
  warn?(message: string): Promise<unknown> | void;
};

export type DeckOutcome =
  | {
      ok: true;
      deck: DeckDraft;
      /** Model calls for the whole deck (1 when the first answer was accepted). */
      attempts: number;
      /** Ids of slides whose diagram was fixed by a single-slide retry. */
      repaired: string[];
      /** Ids of slides that fell back to bullets because their diagram stayed invalid. */
      fellBack: string[];
    }
  | { ok: false; reason: string; attempts: number };

/** Engine refusals that another attempt cannot fix: the job or chapter is gone or not writable. */
const UNFIXABLE = /^(BAD_STATE|NOT_FOUND)\b/;

export function retryMessage(errors: string[], refusedBy: "validation" | "platform" = "validation"): string {
  return [
    refusedBy === "platform"
      ? "The platform refused your deck. Fix what it names and return the complete corrected deck (every slide), in the same JSON shape."
      : "Your deck did not pass validation. Fix every problem below and return the complete corrected deck (every slide), in the same JSON shape.",
    "",
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}

export function repairMessage(slide: DeckSlide, problem: string): string {
  const code = slide.visual?.type === "mermaid" ? slide.visual.code : "";
  return [
    `The Mermaid diagram on slide "${slide.id}" (${slide.title}) is not valid:`,
    "",
    problem,
    "",
    "Its source was:",
    "",
    "```mermaid",
    code,
    "```",
    "",
    `Return only this one slide, corrected, as a single slide object with the id "${slide.id}". Keep its title, bullets and notes; fix the diagram (or replace it with a simpler valid diagram that shows the same thing). Do not return the other slides.`,
  ].join("\n");
}

/**
 * Checks every Mermaid diagram of a validated deck. An invalid one gets `MAX_DIAGRAM_REPAIRS`
 * single-slide retries with the parser's error; if the slide that comes back is still not a valid
 * slide with a valid diagram, the original slide falls back to the bullets layout without its
 * visual. The other slides are never regenerated.
 */
export async function fixDiagrams(
  deck: DeckDraft,
  deps: Pick<DeckDeps, "ask" | "checkDiagrams" | "warn">,
): Promise<{ deck: DeckDraft; repaired: string[]; fellBack: string[] }> {
  const slides = [...deck.slides];
  const repaired: string[] = [];
  const fellBack: string[] = [];
  const withDiagram = slides.flatMap((s, i) => (s.visual?.type === "mermaid" ? [{ i, code: s.visual.code }] : []));
  if (withDiagram.length === 0) return { deck, repaired, fellBack };

  const first = await deps.checkDiagrams(withDiagram.map((d) => d.code));
  if (!first.ok) {
    await deps.warn?.(`Diagram syntax could not be checked (${first.error}); the diagrams were kept unchecked`);
    return { deck, repaired, fellBack };
  }

  for (const [k, { i }] of withDiagram.entries()) {
    let problem = first.problems[k];
    if (!problem) continue;
    const original = slides[i];
    let fixed: DeckSlide | null = null;
    for (let repair = 0; repair < MAX_DIAGRAM_REPAIRS && !fixed; repair++) {
      const reply = await deps.ask(repairMessage(original, problem), "slide");
      if (!reply.ok) break;
      // The repaired slide replaces this one, so it keeps this slide's id whatever the model wrote.
      const data = reply.data && typeof reply.data === "object" ? { ...reply.data, id: original.id } : reply.data;
      const parsed = validateSlideData(data);
      if (!parsed.ok) {
        problem = parsed.errors.join("; ");
        continue;
      }
      if (parsed.slide.visual?.type === "mermaid") {
        const again = await deps.checkDiagrams([parsed.slide.visual.code]);
        const stillBroken = again.ok ? again.problems[0] : `the diagram could not be checked (${again.error})`;
        if (stillBroken) {
          problem = stillBroken;
          continue;
        }
      }
      fixed = parsed.slide;
    }
    if (fixed) {
      slides[i] = fixed;
      repaired.push(original.id);
    } else {
      slides[i] = toBulletsFallback(original);
      fellBack.push(original.id);
      await deps.warn?.(
        `The diagram on slide "${original.id}" (${original.title}) stayed invalid after a retry and was replaced with bullets: ${problem}`,
      );
    }
  }
  return { deck: { ...deck, slides }, repaired, fellBack };
}

/** Runs the pipeline for one chapter's deck. Never throws for a bad model answer or a refused save. */
export async function generateDeck(brief: string, deps: DeckDeps): Promise<DeckOutcome> {
  let message = brief;
  let errors: string[] = [];
  let attempts = 0;
  while (attempts <= MAX_DECK_RETRIES) {
    attempts++;
    const reply = await deps.ask(message, "deck");
    if (!reply.ok) {
      if (reply.fatal) return { ok: false, reason: reply.error, attempts };
      // The call itself failed: ask again with the same message; it still uses up an attempt.
      errors = [`the deck writer failed: ${reply.error}`];
      continue;
    }
    const check = validateGeneratedDeck(reply.data);
    if (!check.ok) {
      errors = check.errors;
      message = retryMessage(errors);
      continue;
    }
    const { deck, repaired, fellBack } = await fixDiagrams(check.deck, deps);
    const saved = await deps.save(deck);
    if (saved.ok) return { ok: true, deck, attempts, repaired, fellBack };
    if (UNFIXABLE.test(saved.message)) return { ok: false, reason: saved.message, attempts };
    errors = [saved.message];
    message = retryMessage(errors, "platform");
  }
  return {
    ok: false,
    reason: `the deck was not accepted after ${MAX_DECK_RETRIES} retries: ${errors.join("; ")}`,
    attempts,
  };
}
