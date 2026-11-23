import { ConvexError } from "convex/values";
import { validateQuestion } from "./grading";
import type { Question, Slide } from "./engineTypes";

/** Shared text validation for course content, used by the engine saves and the admin editing API. */
export const TEXT_LIMIT = 2_000; // slide and question strings

export function invalid(detail: string): never {
  throw new ConvexError(`INVALID: ${detail}`);
}

export function requireText(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) invalid(`${field} must not be empty`);
  if (value.length > max) invalid(`${field} is longer than ${max} characters`);
  return trimmed;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => deepEqual(x, b[i]))
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    return (
      ka.length === kb.length &&
      ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

export function validateSlide(slide: Slide, n: number) {
  const where = `slide ${n}`;
  requireText(slide.title, `${where} title`, TEXT_LIMIT);
  requireText(slide.notes, `${where} notes`, TEXT_LIMIT * 2);
  const list = (items: string[] | undefined, field: string) => {
    if (!items || items.length === 0) invalid(`${where} (${slide.layout}) needs ${field}`);
    items.forEach((item) => requireText(item, `${where} ${field}`, TEXT_LIMIT));
  };
  if (slide.layout === "bullets" || slide.layout === "summary") list(slide.bullets, "bullets");
  if (slide.layout === "two-column") {
    list(slide.left, "left");
    list(slide.right, "right");
  }
  if (slide.layout === "quote") requireText(slide.quote ?? "", `${where} quote`, TEXT_LIMIT);
}

export function validateTestQuestion(q: Question) {
  const id = requireText(q.id, "question id", 100);
  const where = `question ${id}`;
  requireText(q.prompt, `${where} prompt`, TEXT_LIMIT);
  requireText(q.explanation, `${where} explanation`, TEXT_LIMIT);
  q.options.forEach((o, i) => requireText(o, `${where} option ${i + 1}`, TEXT_LIMIT));
  const problem = validateQuestion(q);
  if (problem) invalid(`${where}: ${problem}`);
}

