// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ChapterContent, JobBrief } from "./engine-client";
import { buildDeckBrief, deckStyleGuide } from "./deck-brief";

const job = (over: Partial<JobBrief> = {}): JobBrief => ({
  jobId: "job1",
  status: "writing",
  topic: "How DNS works",
  language: "en",
  level: "beginner",
  length: "short",
  audience: "junior developers",
  resources: [],
  sources: [
    { id: "s1", url: "https://example.org/dns", title: "DNS explained", kind: "web", excerpt: "DNS is the phone book   of the internet." },
    { id: "s2", url: "https://example.org/no-excerpt", title: "No excerpt", kind: "web" },
  ],
  course: {
    courseId: "c1",
    chapters: [1, 2, 3].map((order) => ({
      order,
      title: `Chapter ${order} title`,
      summary: `Goal of chapter ${order}`,
      subchapters: [1, 2].map((s) => ({ order: s, title: `Lesson ${order}.${s}`, summary: "", hasBody: true })),
      hasDeck: false,
      hasTest: true,
    })),
  },
  ...over,
});

const content = (over: Partial<ChapterContent> = {}): ChapterContent => ({
  chapterOrder: 2,
  title: "Chapter 2 title",
  lessons: [
    { order: 1, title: "Lesson 2.1", body: "A resolver asks the root, then the TLD, then the authoritative server.", truncated: false },
    { order: 2, title: "Lesson 2.2", body: "Answers are cached for their TTL.", truncated: true },
  ],
  deckSlideTitles: ["Old slide one", "Old slide two"],
  testPrompts: [],
  ...over,
});

describe("buildDeckBrief", () => {
  const brief = buildDeckBrief(job(), content());

  test("names the chapter and carries the course brief", () => {
    expect(brief).toMatch(/^# Slide deck for chapter 2: Chapter 2 title/);
    expect(brief).toContain("- Topic: How DNS works");
    expect(brief).toContain("- Language: English (en).");
    expect(brief).toContain("- Level: beginner");
    expect(brief).toContain("- Audience: junior developers");
    expect(brief).toContain("Goal: Goal of chapter 2");
  });

  test("carries the whole course outline and marks this chapter, so decks do not overlap", () => {
    expect(brief).toContain("1. Chapter 1 title\n   1.1 Lesson 1.1\n   1.2 Lesson 1.2");
    expect(brief).toContain("2. Chapter 2 title (this chapter)");
    expect(brief).toContain("3. Chapter 3 title");
    expect(brief).toContain("Stay inside this chapter");
  });

  test("carries the same style guide for every chapter of the course", () => {
    const guide = deckStyleGuide(job());
    expect(brief).toContain(`## Style guide (the same for every chapter of this course)\n\n${guide}`);
    expect(buildDeckBrief(job(), content({ chapterOrder: 3, title: "Chapter 3 title" }))).toContain(guide);
    expect(guide).toContain("junior developers at beginner level");
    expect(guide).toMatch(/at most 5 per slide, each under 12 words/);
    expect(guide).toContain("Never invent data to fill a chart");
  });

  test("carries the chapter's saved lessons, which the deck must present", () => {
    expect(brief).toContain("### Lesson 2.1: Lesson 2.1\n\nA resolver asks the root, then the TLD, then the authoritative server.");
    expect(brief).toContain("### Lesson 2.2: Lesson 2.2\n\nAnswers are cached for their TTL.\n\n[Truncated: the saved lesson is longer.]");
    expect(brief).toContain("present nothing they do not teach");
  });

  test("states the rules: slide count, title and summary, 40% visuals, Mermaid, bullet limits, notes", () => {
    for (const needle of [
      "8-15 slides",
      "The first uses the `title` layout, the last the `summary` layout",
      "At least 40% of the slides carry a `visual`",
      "Diagrams are always Mermaid code",
      "At most 5 bullets per slide, each under 12 words",
      "Speaker notes of 2-4 sentences",
      "No URLs anywhere",
    ]) {
      expect(brief).toContain(needle);
    }
  });

  test("offers source excerpts for quote slides without showing any URL", () => {
    expect(brief).toContain('- "DNS explained": DNS is the phone book of the internet.');
    expect(brief).not.toContain("No excerpt");
    expect(brief).not.toMatch(/https?:\/\//);
    expect(buildDeckBrief(job({ sources: [] }), content())).toContain("None: use no `quote` slide.");
  });

  test("a regenerate adds the admin's instruction and the titles of the deck it replaces", () => {
    expect(brief).not.toContain("## Regenerate");
    const redo = buildDeckBrief(job(), content(), "More diagrams");
    expect(redo.startsWith(brief)).toBe(true);
    expect(redo).toContain("## Regenerate\n\nThis deck replaces the chapter's saved deck. The admin asked: More diagrams");
    expect(redo).toContain("- Old slide one\n- Old slide two");
  });

  test("is deterministic and refuses a chapter the course does not have", () => {
    expect(buildDeckBrief(job(), content())).toBe(brief);
    expect(() => buildDeckBrief(job(), content({ chapterOrder: 9 }))).toThrow("The course has no chapter 9");
  });

  test("Hebrew and Russian courses are told to write every label in that language", () => {
    expect(buildDeckBrief(job({ language: "he" }), content())).toContain("- Language: Hebrew (he). Everything learners read is in Hebrew");
    expect(buildDeckBrief(job({ language: "ru" }), content())).toContain("- Language: Russian (ru).");
  });
});
