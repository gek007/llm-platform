import { describe, expect, it } from "vitest";
import { validateQuestion } from "../../../convex/lib/grading";
import type { Question, Slide } from "../../../convex/lib/engineTypes";
import { runFakeEngine, type EngineCall } from "./fake-engine";

type Call = { op: string; body: Record<string, unknown> };

/** A scripted engine: getJob returns what the real API would for the given phase. */
function scripted(opts: {
  chapters?: number;
  subs?: number;
  withCourse: boolean;
}) {
  const calls: Call[] = [];
  const nChapters = opts.chapters ?? 2;
  const nSubs = opts.subs ?? 2;
  const call: EngineCall = async (op, body) => {
    const b = body as Record<string, unknown>;
    calls.push({ op, body: b });
    if (op === "getJob") {
      return {
        ok: true,
        jobId: b.jobId,
        status: opts.withCourse ? "writing" : "researching",
        topic: "Intro to RAG",
        language: "en",
        resources: [
          { id: "r1", kind: "url", title: "Admin link", readStatus: "pending" },
          { id: "r2", kind: "youtube", title: "Vid", readStatus: "embed_only" },
        ],
        sources: opts.withCourse
          ? [
              {
                id: "s1",
                url: "https://example.com/a",
                title: "A",
                kind: "web",
              },
              {
                id: "s2",
                url: "https://example.com/b",
                title: "B",
                kind: "web",
              },
            ]
          : [],
        course: opts.withCourse
          ? {
              courseId: "c1",
              chapters: Array.from({ length: nChapters }, (_, i) => ({
                order: i + 1,
                title: `Ch ${i + 1}`,
                subchapters: Array.from({ length: nSubs }, (_, j) => ({
                  order: j + 1,
                  title: `S ${i + 1}.${j + 1}`,
                })),
              })),
            }
          : undefined,
      };
    }
    if (op === "saveSources") {
      const sources = (b.sources as unknown[]).map((_, i) => ({
        id: `src${i + 1}`,
        url: "https://x",
      }));
      return { ok: true, sources };
    }
    return { ok: true };
  };
  return { calls, call };
}
const ops = (calls: Call[]) => calls.map((c) => c.op);

describe("runFakeEngine", () => {
  it("research: marks resources, saves sources then a 2x2 outline", async () => {
    const { calls, call } = scripted({ withCourse: false });
    const out = await runFakeEngine({ action: "research", jobId: "j1" }, call);
    expect(out).toEqual({ sessionId: "fake-j1" });
    const names = ops(calls);
    expect(names[0]).toBe("getJob");
    expect(names.indexOf("setResourceStatus")).toBeLessThan(
      names.indexOf("saveSources"),
    );
    expect(names.indexOf("saveSources")).toBeLessThan(
      names.indexOf("saveOutline"),
    );
    expect(calls.filter((c) => c.op === "setResourceStatus")).toHaveLength(1); // the youtube one is already set
    const sources = calls.find((c) => c.op === "saveSources")!.body.sources as {
      url: string;
    }[];
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.length).toBeLessThanOrEqual(3);
    for (const s of sources) expect(s.url).toMatch(/^https:\/\//);
    const outline = calls.find((c) => c.op === "saveOutline")!.body.outline as {
      chapters: { subchapters: unknown[] }[];
    };
    expect(outline.chapters).toHaveLength(2);
    expect(outline.chapters.every((c) => c.subchapters.length === 2)).toBe(
      true,
    );
    expect(names).toContain("reportProgress");
    expect(names).not.toContain("finishJob");
  });

  it("write: per chapter subchapters, deck, test, then finishJob; payloads satisfy the caps", async () => {
    const { calls, call } = scripted({ withCourse: true });
    const out = await runFakeEngine({ action: "write", jobId: "j1" }, call);
    expect(out).toEqual({ sessionId: "fake-j1" });
    const names = ops(calls).filter(
      (o) => o !== "reportProgress" && o !== "getJob",
    );
    expect(names).toEqual([
      "saveSubchapter",
      "saveSubchapter",
      "saveDeck",
      "saveTest",
      "saveSubchapter",
      "saveSubchapter",
      "saveDeck",
      "saveTest",
      "finishJob",
    ]);
    const sub = calls.find((c) => c.op === "saveSubchapter")!.body;
    expect(sub.sourceIds).toEqual(["s1", "s2"]);
    expect(sub.body as string).toContain("[1]");
    expect(sub.body as string).toContain("```quiz");
    expect(sub.body as string).not.toMatch(/https?:\/\//);
    for (const d of calls.filter((c) => c.op === "saveDeck")) {
      const slides = d.body.slides as Slide[];
      expect(slides.length).toBeGreaterThanOrEqual(6);
      expect(slides.length).toBeLessThanOrEqual(12);
      expect(new Set(slides.map((s) => s.layout)).size).toBeGreaterThan(2);
      expect(JSON.stringify(slides)).not.toMatch(/https?:\/\//);
    }
    for (const t of calls.filter((c) => c.op === "saveTest")) {
      const qs = t.body.questions as Question[];
      expect(qs.length).toBeGreaterThanOrEqual(8);
      expect(qs.length).toBeLessThanOrEqual(10);
      for (const q of qs) expect(validateQuestion(q)).toBeNull();
      expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThan(1);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      expect(JSON.stringify(qs)).not.toMatch(/https?:\/\//);
    }
  });

  it("regenerate: redoes only the target then finishJob", async () => {
    const { calls, call } = scripted({ withCourse: true });
    await runFakeEngine(
      {
        action: "regenerate",
        jobId: "j1",
        target: { kind: "deck", chapterOrder: 2 },
        instruction: "x",
      },
      call,
    );
    const writes = calls.filter(
      (c) => !["getJob", "reportProgress"].includes(c.op),
    );
    expect(writes.map((c) => c.op)).toEqual(["saveDeck", "finishJob"]);
    expect(writes[0].body.chapterOrder).toBe(2);

    const s = scripted({ withCourse: true });
    await runFakeEngine(
      {
        action: "regenerate",
        jobId: "j1",
        target: { kind: "subchapter", chapterOrder: 1, subchapterOrder: 2 },
        instruction: "x",
      },
      s.call,
    );
    const sw = s.calls.filter((c) => c.op === "saveSubchapter");
    expect(sw).toHaveLength(1);
    expect(sw[0].body).toMatchObject({ chapterOrder: 1, subchapterOrder: 2 });

    const c = scripted({ withCourse: true });
    await runFakeEngine(
      {
        action: "regenerate",
        jobId: "j1",
        target: { kind: "chapter", chapterOrder: 1 },
        instruction: "",
      },
      c.call,
    );
    expect(ops(c.calls).filter((o) => o.startsWith("save"))).toEqual([
      "saveSubchapter",
      "saveSubchapter",
      "saveDeck",
      "saveTest",
    ]);
    expect(ops(c.calls).at(-1)).toBe("finishJob");
  });

  it("regenerate for a missing target fails loudly", async () => {
    const { call } = scripted({ withCourse: true });
    await expect(
      runFakeEngine(
        {
          action: "regenerate",
          jobId: "j1",
          target: { kind: "deck", chapterOrder: 9 },
          instruction: "",
        },
        call,
      ),
    ).rejects.toThrow(/chapter 9/);
  });
});
