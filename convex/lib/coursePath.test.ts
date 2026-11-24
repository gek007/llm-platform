// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { chapterOfLesson, chapterToStart } from "./coursePath";

const chapters = [
  { slug: "chapter-1", lessonIds: ["l1", "l2"], hasDeck: true },
  { slug: "chapter-2", lessonIds: ["l3", "l4"], hasDeck: true },
  { slug: "chapter-3", lessonIds: ["l5"], hasDeck: false },
];

describe("chapterToStart: a chapter opens with its slides", () => {
  it("a new learner starts at the first chapter's slides", () => {
    expect(chapterToStart("l1", chapters, new Set())).toBe("chapter-1");
  });

  it("mid-chapter, the learner continues at the lesson", () => {
    expect(chapterToStart("l2", chapters, new Set(["l1"]))).toBeNull();
  });

  it("moving on to the next chapter opens that chapter's slides", () => {
    expect(chapterToStart("l3", chapters, new Set(["l1", "l2"]))).toBe("chapter-2");
  });

  it("a chapter is started once any of its lessons is done, whatever the order", () => {
    expect(chapterToStart("l3", chapters, new Set(["l4"]))).toBeNull();
  });

  it("a chapter without slides, a course without chapters and no next lesson all go to the lesson", () => {
    expect(chapterToStart("l5", chapters, new Set())).toBeNull();
    expect(chapterToStart("l1", [], new Set())).toBeNull();
    expect(chapterToStart(undefined, chapters, new Set())).toBeNull();
    expect(chapterToStart("unknown", chapters, new Set())).toBeNull();
  });

  it("chapterOfLesson finds a lesson's chapter", () => {
    expect(chapterOfLesson("l4", chapters)?.slug).toBe("chapter-2");
    expect(chapterOfLesson("nope", chapters)).toBeUndefined();
  });
});
