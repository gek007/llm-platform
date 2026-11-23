import { describe, expect, it } from "vitest";
import { chapterSlug, courseSlugFor, lessonSlug } from "./slugs";

describe("slugs", () => {
  it("chapter and lesson slugs", () => {
    expect(chapterSlug(2)).toBe("chapter-2");
    expect(lessonSlug(2, 3)).toBe("lesson-2-3");
  });
  it("kebab from Latin titles", () => {
    expect(courseSlugFor("Intro to RAG!", new Set())).toBe("intro-to-rag");
  });
  it("falls back to course-<6 hex> for non-Latin titles", () => {
    expect(courseSlugFor("מבוא לבינה מלאכותית", new Set())).toMatch(/^course-[0-9a-f]{6}$/);
    expect(courseSlugFor("ab", new Set())).toMatch(/^course-[0-9a-f]{6}$/);
  });
  it("suffixes on collision", () => {
    expect(courseSlugFor("Intro", new Set(["intro"]))).toBe("intro-2");
    expect(courseSlugFor("Intro", new Set(["intro", "intro-2"]))).toBe("intro-3");
  });
});
