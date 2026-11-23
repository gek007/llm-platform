// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { JobBrief } from "../../../../convex/lib/engineTypes";
import { buildWriterBrief, writerOutputSchema } from "./writer-brief";

type Resource = JobBrief["resources"][number];
const resource = (r: Partial<Resource> & Pick<Resource, "id" | "kind" | "title">): Resource => ({
  readStatus: "read",
  ...r,
});

function job(over: Partial<JobBrief> = {}): JobBrief {
  return {
    jobId: "job1",
    status: "writing",
    topic: "Basics of personal budgeting",
    language: "en",
    level: "beginner",
    length: "short",
    audience: "First-year students",
    notes: "Use euro examples.",
    resources: [
      resource({ id: "res-pdf", kind: "pdf", title: "Budget guide", fileUrl: "https://example.convex.cloud/api/storage/abc" }),
      resource({ id: "res-yt", kind: "youtube", title: "Budgeting in 5 minutes", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", readStatus: "embed_only" }),
      resource({ id: "res-text", kind: "text", title: "Teacher's checklist", text: "1. Track every expense for a week." }),
      resource({ id: "res-broken", kind: "pdf", title: "Scanned handout", readStatus: "unreadable" }),
      resource({ id: "res-other", kind: "pdf", title: "Investing primer" }),
    ],
    sources: [
      { id: "src-a", url: "https://www.consumerfinance.gov/budget", title: "Make a budget", kind: "web", excerpt: "List income, then fixed costs." },
      { id: "src-b", url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Envelope method", kind: "youtube" },
    ],
    outline: {
      chapters: [
        { title: "Why budget", goal: "Explain why a budget helps", subchapters: [{ title: "Money in, money out", goal: "Tell income from spending", resourceIds: ["res-other"] }] },
        {
          title: "Build your first budget",
          goal: "Build a monthly budget from scratch",
          subchapters: [
            { title: "List your income", goal: "Add up every monthly income source", resourceIds: ["res-pdf", "res-broken"] },
            { title: "Track your spending", goal: "Sort a week of expenses into categories", resourceIds: ["res-yt", "res-text"] },
            { title: "Balance it", goal: "Adjust spending until the budget balances" },
          ],
        },
        { title: "Stick with it", goal: "Keep a budget going", subchapters: [{ title: "Review monthly", goal: "Run a monthly review" }] },
      ],
    },
    course: {
      courseId: "course1",
      chapters: [
        { order: 1, title: "Why budget", summary: "Explain why a budget helps", subchapters: [{ order: 1, title: "Money in, money out", summary: "Tell income from spending", hasBody: false }], hasDeck: false, hasTest: false },
        {
          order: 2,
          title: "Build your first budget",
          summary: "Build a monthly budget from scratch",
          subchapters: [
            { order: 1, title: "List your income", summary: "Add up every monthly income source", hasBody: false },
            { order: 2, title: "Track your spending", summary: "Sort a week of expenses into categories", hasBody: false },
            { order: 3, title: "Balance it", summary: "Adjust spending until the budget balances", hasBody: false },
          ],
          hasDeck: false,
          hasTest: false,
        },
        { order: 3, title: "Stick with it", summary: "Keep a budget going", subchapters: [{ order: 1, title: "Review monthly", summary: "Run a monthly review", hasBody: false }], hasDeck: false, hasTest: false },
      ],
    },
    ...over,
  };
}

describe("buildWriterBrief", () => {
  test("states the job, course brief and the chapter with every subchapter title and goal", () => {
    const brief = buildWriterBrief(job(), 2);
    for (const needle of [
      "job1",
      "Basics of personal budgeting",
      "First-year students",
      "beginner",
      "English (en)",
      "Use euro examples.",
      "Chapter 2: Build your first budget",
      "Build a monthly budget from scratch",
      "2.1 List your income",
      "Add up every monthly income source",
      "2.2 Track your spending",
      "Sort a week of expenses into categories",
      "2.3 Balance it",
      "Adjust spending until the budget balances",
    ]) {
      expect(brief).toContain(needle);
    }
  });

  test("lists every saved source as [id] title — url — excerpt", () => {
    const brief = buildWriterBrief(job(), 2);
    expect(brief).toContain("[src-a] Make a budget — https://www.consumerfinance.gov/budget — List income, then fixed costs.");
    expect(brief).toContain("[src-b] Envelope method — https://www.youtube.com/watch?v=abcdefghijk");
    // A YouTube source can be embedded by its video ID.
    expect(brief).toContain('```youtube\n{"videoId":"abcdefghijk","title":"Envelope method"}\n```');
  });

  test("pasted text is source material only: listed under Pasted material, never a block", () => {
    const brief = buildWriterBrief(job(), 2);
    expect(brief).not.toContain('{"resourceId":"res-text"}');
    expect(brief).not.toContain("res-text");
    expect(brief).toContain("## Pasted material");
    expect(brief).toContain('- "Teacher\'s checklist": 1. Track every expense for a week.');
    expect(brief).toMatch(/source material only.*Never place it with a ```resource block/);
    // Every chapter's writer gets the job's pasted text (it can't be planned for a lesson).
    expect(buildWriterBrief(job(), 1)).toContain("Track every expense for a week.");
    // Without pasted text there is no such section.
    const noText = job({ resources: job().resources.filter((r) => r.kind !== "text") });
    expect(buildWriterBrief(noText, 2)).not.toContain("## Pasted material");
  });

  test("offers only this chapter's readable planned resources, with their embed blocks", () => {
    const brief = buildWriterBrief(job(), 2);
    expect(brief).toContain('```resource\n{"resourceId":"res-pdf"}\n```');
    expect(brief).toContain('```youtube\n{"videoId":"dQw4w9WgXcQ","title":"Budgeting in 5 minutes"}\n```');
    // Another chapter's resource, an unreadable one and a storage URL never appear.
    expect(brief).not.toContain("res-other");
    expect(brief).not.toContain("Investing primer");
    expect(brief).not.toContain("res-broken");
    expect(brief).not.toContain("api/storage");
  });

  test("after the admin renames and reorders lessons, goals come from the rows and unmatched planned resources go to chapter level", () => {
    const base = job();
    const chapters = base.course!.chapters.map((c) =>
      c.order !== 2
        ? c
        : {
            ...c,
            subchapters: [
              { order: 1, title: "Track your spending", summary: "Sort a week of expenses into categories", hasBody: false },
              { order: 2, title: "Your income sources", summary: "Name every income source and add them up", hasBody: false },
              { order: 3, title: "Balance it", summary: "Adjust spending until the budget balances", hasBody: false },
            ],
          },
    );
    const brief = buildWriterBrief({ ...base, course: { ...base.course!, chapters } }, 2);
    expect(brief).toContain("- 2.1 Track your spending (subchapterOrder 1) — goal: Sort a week of expenses into categories");
    expect(brief).toContain("- 2.2 Your income sources (subchapterOrder 2) — goal: Name every income source and add them up");
    // The frozen outline's goal for the renamed lesson is not used.
    expect(brief).not.toContain("Add up every monthly income source");
    // Exact title match keeps the video and text on "Track your spending", now 2.1.
    expect(brief).toContain('- Subchapter 2.1, YouTube video "Budgeting in 5 minutes"');
    expect(brief).not.toContain('Text "Teacher\'s checklist"');
    // The renamed lesson's PDF lands at chapter level, never on a neighbour by position.
    expect(brief).toContain('- Chapter 2, planned for "List your income", PDF "Budget guide"');
    expect(brief).not.toMatch(/Subchapter 2\.\d, PDF "Budget guide"/);
    expect(brief).toContain('```resource\n{"resourceId":"res-pdf"}\n```');
  });

  test("caps each source excerpt in the brief", () => {
    const long = `${"Fact. ".repeat(300)}TAILMARK`;
    const brief = buildWriterBrief(job({ sources: [{ id: "src-l", url: "https://example.org/l", title: "Long", kind: "web", excerpt: long }] }), 2);
    expect(brief).toContain(`[src-l] Long — https://example.org/l — ${long.slice(0, 1_500).trim()}…`);
    expect(brief).not.toContain("TAILMARK");
  });

  test("restricts quotes and citations to what the brief shows", () => {
    const brief = buildWriterBrief(job(), 2);
    expect(brief).toMatch(/quote.*word for word/i);
    expect(brief).toMatch(/never attribute a specific figure or quote/i);
  });

  test("a chapter without planned resources says there is nothing to embed", () => {
    const brief = buildWriterBrief(job(), 3);
    expect(brief).toContain("Chapter 3: Stick with it");
    expect(brief).not.toContain("res-pdf");
    expect(brief).toMatch(/No admin resources are planned for this chapter/);
  });

  test("names the language and the localized True/False labels for Hebrew and Russian", () => {
    const he = buildWriterBrief(job({ language: "he" }), 2);
    expect(he).toContain("Hebrew (he)");
    expect(he).toContain('["נכון","לא נכון"]');
    const ru = buildWriterBrief(job({ language: "ru" }), 2);
    expect(ru).toContain("Russian (ru)");
    expect(ru).toContain('["Верно","Неверно"]');
    expect(buildWriterBrief(job(), 2)).toContain('["True","False"]');
  });

  test("states the save rules and is deterministic", () => {
    const brief = buildWriterBrief(job(), 2);
    for (const needle of ["chapterOrder 2", "sourceIds", "6-12", "8-10", "Unknown reference"]) {
      expect(brief).toContain(needle);
    }
    expect(buildWriterBrief(job(), 2)).toBe(brief);
  });

  test("without sources it forbids citations and links", () => {
    const brief = buildWriterBrief(job({ sources: [] }), 2);
    expect(brief).toMatch(/No saved sources/);
  });

  test("throws for a chapter the course does not have", () => {
    expect(() => buildWriterBrief(job(), 9)).toThrow(/chapter 9/);
    expect(() => buildWriterBrief(job({ course: undefined }), 1)).toThrow(/chapter 1/);
  });
});

describe("writerOutputSchema", () => {
  test("accepts the writer's report and rejects a malformed one", () => {
    const report = { chapterOrder: 2, saved: { subchapters: 3, deck: true, test: false }, problems: ["saveTest: INVALID: …"] };
    expect(writerOutputSchema.parse(report)).toEqual(report);
    expect(writerOutputSchema.safeParse({ chapterOrder: 2, saved: { subchapters: 3 }, problems: [] }).success).toBe(false);
    expect(writerOutputSchema.safeParse({ ...report, problems: "none" }).success).toBe(false);
  });
});
