import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CHAPTER_BODY_CAP, type EventKind, type JobBrief, type Question, type Slide } from "../../../../convex/lib/engineTypes";
import { validateQuestion } from "../../../../convex/lib/grading";
import {
  findResourceBlockIds,
  findUnknownRefs,
  findUnknownRefsInText,
  type KnownRefs,
} from "../../../../convex/lib/sourceScan";

/**
 * An in-memory stand-in for the Convex `/engine/*` HTTP API (convex/http.ts + convex/engine.ts) for
 * the course-builder eval: one job already in `writing`, with its course skeleton. It speaks the
 * same wire format (`POST /engine/<op>`, `{ ok: true, ...result }` or `{ ok: false, error:
 * "CODE: detail" }`) and validates content saves the way the real engine does where that is cheap:
 * job state, chapter/subchapter existence, text limits, slide and question counts and shapes
 * (the real `validateQuestion`), sourceIds belonging to the job, no ```resource block for pasted
 * text, and "no invented links" (the real `findUnknownRefs` / `findUnknownRefsInText`). `finishJob` lists what is missing like the real one.
 * Accepts any non-empty bearer token (it is local and holds no secrets).
 */

export type FakeLesson = { order: number; title: string; summary: string; body: string; durationMinutes?: number; sourceIds: string[] };
export type FakeChapter = {
  order: number;
  title: string;
  summary: string;
  lessons: FakeLesson[];
  deck?: Slide[];
  test?: { questions: Question[]; version: number };
};
export type FakeJob = Omit<JobBrief, "course"> & { courseId: string; chapters: FakeChapter[]; error?: string };
export type FakeEvent = { kind: EventKind; message: string; chapterOrder?: number };
export type FakeCall = { op: string; ok: boolean; error?: string };

const LIMITS = { title: 300, summary: 2_000, body: 100_000, message: 2_000, text: 2_000, maxDurationMinutes: 240 };
const EVENT_KINDS: EventKind[] = ["info", "source", "outline", "chapter", "error"];

class Refused extends Error {}
const fail = (code: string, detail: string): never => {
  throw new Refused(`${code}: ${detail}`);
};

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) return fail("INVALID", `${field} must not be empty`);
  if (value.length > max) fail("INVALID", `${field} is longer than ${max} characters`);
  return value.trim();
}

function requireOrder(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) fail("INVALID", `${field} must be a positive integer`);
  return value as number;
}

export function createFakeEngine(job: FakeJob) {
  const events: FakeEvent[] = [];
  const calls: FakeCall[] = [];

  const known = (): KnownRefs => ({
    urls: new Set(job.sources.map((s) => s.url)),
    videoIds: new Set(),
    resourceIds: new Set(job.resources.map((r) => r.id)),
  });

  const rejectUnknownRefs = ({ markdown, texts = [] }: { markdown?: string; texts?: string[] }) => {
    const refs = new Set(markdown === undefined ? [] : findUnknownRefs(markdown, known()));
    for (const text of texts) for (const ref of findUnknownRefsInText(text, known())) refs.add(ref);
    if (refs.size > 0) throw new Refused(`Unknown reference: ${[...refs].join(", ")}`);
  };

  /** Content writes: only in `writing`; a `failed` job resumes to `writing` (late writes). */
  const enterWriting = (op: string) => {
    if (job.status === "failed") job.status = "writing";
    if (job.status !== "writing") fail("BAD_STATE", `${op} is not allowed while the job is ${job.status}`);
  };

  const chapterOf = (order: unknown) => {
    const n = requireOrder(order, "chapterOrder");
    return job.chapters.find((c) => c.order === n) ?? fail("NOT_FOUND", `chapter ${n}`);
  };

  const requireJob = (jobId: unknown) => {
    if (jobId !== job.jobId) fail("NOT_FOUND", `job ${String(jobId).slice(0, 64)}`);
  };

  const ops: Record<string, (a: Record<string, unknown>) => Record<string, unknown>> = {
    getJob: () => {
      const { courseId, chapters, error, ...brief } = job;
      void error;
      const out: JobBrief = {
        ...brief,
        course: {
          courseId,
          chapters: chapters.map((c) => ({
            order: c.order,
            title: c.title,
            summary: c.summary,
            subchapters: c.lessons.map((l) => ({ order: l.order, title: l.title, summary: l.summary, hasBody: l.body.trim() !== "" })),
            hasDeck: c.deck !== undefined,
            hasTest: c.test !== undefined,
          })),
        },
      };
      return out;
    },
    getChapterContent: (a) => {
      const chapter = chapterOf(a.chapterOrder);
      return {
        chapterOrder: chapter.order,
        title: chapter.title,
        lessons: chapter.lessons.map((l) => ({
          order: l.order,
          title: l.title,
          body: l.body.slice(0, CHAPTER_BODY_CAP),
          truncated: l.body.length > CHAPTER_BODY_CAP,
        })),
        deckSlideTitles: chapter.deck?.map((s) => s.title) ?? [],
        testPrompts: chapter.test?.questions.map((q) => q.prompt) ?? [],
      };
    },
    reportProgress: (a) => {
      if (job.status !== "writing" && job.status !== "researching") fail("BAD_STATE", `reportProgress is not allowed while the job is ${job.status}`);
      if (!EVENT_KINDS.includes(a.kind as EventKind)) fail("INVALID", "kind");
      const message = requireText(a.message, "message", LIMITS.message);
      if (a.chapterOrder !== undefined) requireOrder(a.chapterOrder, "chapterOrder");
      events.push({ kind: a.kind as EventKind, message, chapterOrder: a.chapterOrder as number | undefined });
      return {};
    },
    saveSubchapter: (a) => {
      enterWriting("saveSubchapter");
      const chapter = chapterOf(a.chapterOrder);
      const sub = requireOrder(a.subchapterOrder, "subchapterOrder");
      const lesson = chapter.lessons.find((l) => l.order === sub) ?? fail("NOT_FOUND", `subchapter ${chapter.order}.${sub}`);
      const title = requireText(a.title, "title", LIMITS.title);
      const summary = requireText(a.summary, "summary", LIMITS.summary);
      const body = requireText(a.body, "body", LIMITS.body);
      const minutes = a.durationMinutes;
      if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > LIMITS.maxDurationMinutes) {
        fail("INVALID", `durationMinutes must be an integer from 1 to ${LIMITS.maxDurationMinutes}`);
      }
      const sourceIds = Array.isArray(a.sourceIds) ? (a.sourceIds as string[]) : fail("INVALID", "sourceIds");
      for (const id of sourceIds) {
        if (!job.sources.some((s) => s.id === id)) fail("NOT_FOUND", `source ${id} is not a source of this job`);
      }
      for (const id of findResourceBlockIds(body)) {
        if (job.resources.some((r) => r.id === id && r.kind === "text")) {
          fail("INVALID", `resource ${id} is pasted text: source material only; never place it with a \`\`\`resource block`);
        }
      }
      rejectUnknownRefs({ markdown: body, texts: [title, summary] });
      Object.assign(lesson, { title, summary, body: a.body as string, durationMinutes: minutes, sourceIds });
      events.push({ kind: "chapter", message: `Saved subchapter ${chapter.order}.${sub}`, chapterOrder: chapter.order });
      return { lessonId: `lesson-${chapter.order}-${sub}` };
    },
    saveDeck: (a) => {
      enterWriting("saveDeck");
      const chapter = chapterOf(a.chapterOrder);
      const slides = Array.isArray(a.slides) ? (a.slides as Slide[]) : fail("INVALID", "slides");
      if (slides.length < 6 || slides.length > 12) fail("INVALID", `a deck needs 6-12 slides, got ${slides.length}`);
      slides.forEach((s, i) => {
        const where = `slide ${i + 1}`;
        requireText(s.title, `${where} title`, LIMITS.text);
        requireText(s.notes, `${where} notes`, LIMITS.text * 2);
        const list = (items: string[] | undefined, field: string) => {
          if (!items || items.length === 0) fail("INVALID", `${where} (${s.layout}) needs ${field}`);
          items!.forEach((item) => requireText(item, `${where} ${field}`, LIMITS.text));
        };
        if (s.layout === "bullets" || s.layout === "summary") list(s.bullets, "bullets");
        if (s.layout === "two-column") {
          list(s.left, "left");
          list(s.right, "right");
        }
        if (s.layout === "quote") requireText(s.quote ?? "", `${where} quote`, LIMITS.text);
      });
      rejectUnknownRefs({
        texts: slides.flatMap((s) => [s.title, ...(s.bullets ?? []), ...(s.left ?? []), ...(s.right ?? []), s.quote ?? "", s.attribution ?? "", s.notes]),
      });
      chapter.deck = slides;
      events.push({ kind: "chapter", message: `Saved slide deck (${slides.length} slides)`, chapterOrder: chapter.order });
      return { deckId: `deck-${chapter.order}` };
    },
    saveTest: (a) => {
      enterWriting("saveTest");
      const chapter = chapterOf(a.chapterOrder);
      const questions = Array.isArray(a.questions) ? (a.questions as Question[]) : fail("INVALID", "questions");
      if (questions.length < 8 || questions.length > 10) fail("INVALID", `a test needs 8-10 questions, got ${questions.length}`);
      for (const q of questions) {
        const id = requireText(q.id, "question id", 100);
        requireText(q.prompt, `question ${id} prompt`, LIMITS.text);
        requireText(q.explanation, `question ${id} explanation`, LIMITS.text);
        q.options.forEach((o, i) => requireText(o, `question ${id} option ${i + 1}`, LIMITS.text));
        const problem = validateQuestion(q);
        if (problem) fail("INVALID", `question ${id}: ${problem}`);
      }
      const ids = questions.map((q) => q.id.trim());
      if (new Set(ids).size !== ids.length) fail("INVALID", "question ids must be unique");
      rejectUnknownRefs({ texts: questions.flatMap((q) => [q.prompt, ...q.options, q.explanation]) });
      const changed = JSON.stringify(chapter.test?.questions) !== JSON.stringify(questions);
      const version = chapter.test ? chapter.test.version + (changed ? 1 : 0) : 1;
      chapter.test = { questions, version };
      events.push({ kind: "chapter", message: `Saved test (${questions.length} questions, version ${version})`, chapterOrder: chapter.order });
      return { testId: `test-${chapter.order}`, version };
    },
    finishJob: () => {
      if (job.status === "ready") return {};
      enterWriting("finishJob");
      const missing: string[] = [];
      for (const ch of job.chapters) {
        for (const l of ch.lessons) if (!l.body.trim()) missing.push(`Chapter ${ch.order}: lesson "${l.title}" has no body`);
        if (!ch.deck) missing.push(`Chapter ${ch.order}: deck missing`);
        if (!ch.test) missing.push(`Chapter ${ch.order}: test missing`);
      }
      if (missing.length > 0) fail("INCOMPLETE", missing.join("; "));
      job.status = "ready";
      return {};
    },
    failJob: (a) => {
      job.error = requireText(a.error, "error", LIMITS.message);
      job.status = "failed";
      events.push({ kind: "error", message: job.error });
      return {};
    },
  };

  /** Runs one op the way the HTTP route does: the op's result, or the refusal. */
  function call(op: string, args: Record<string, unknown>): { ok: true } & Record<string, unknown> | { ok: false; error: string } {
    try {
      const run = ops[op] ?? fail("BAD_STATE", `${op} is not available in this fake engine (the job is ${job.status})`);
      requireJob(args.jobId);
      const result = { ok: true as const, ...run(args) };
      calls.push({ op, ok: true });
      return result;
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      calls.push({ op, ok: false, error: err.message });
      return { ok: false, error: err.message };
    }
  }

  return { job, events, calls, call };
}

export type FakeEngine = ReturnType<typeof createFakeEngine>;

/** Serves a fake engine on 127.0.0.1 (random port) at `POST /engine/<op>`. */
export async function serveFakeEngine(engine: FakeEngine): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const op = /^\/engine\/([A-Za-z]+)$/.exec(req.url ?? "")?.[1];
    if (req.method !== "POST" || !op) return reply(404, { ok: false, error: "NOT_FOUND: route" });
    if (!/^Bearer \S+$/.test(req.headers.authorization ?? "")) return reply(401, { ok: false, error: "UNAUTHORIZED" });
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (raw += chunk));
    req.on("end", () => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return reply(400, { ok: false, error: "INVALID: body is not JSON" });
      }
      try {
        const result = engine.call(op, args);
        reply(result.ok ? 200 : 400, result);
      } catch (err) {
        reply(500, { ok: false, error: `INTERNAL: ${err instanceof Error ? err.message : String(err)}` });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

/** The eval's tiny course: one chapter of two subchapters, approved and waiting to be written. */
export function tinyCourseJob(): FakeJob {
  return {
    jobId: "fakejob_tiny_course",
    status: "writing",
    topic: "Basics of personal budgeting",
    language: "en",
    level: "beginner",
    length: "short",
    audience: "Young adults with their first salary",
    resources: [],
    sources: [
      {
        id: "src_50_30_20",
        url: "https://example.org/budgeting-basics",
        title: "Budgeting basics (eval fixture)",
        kind: "web",
        excerpt:
          "A budget is a plan for how you will spend and save your money each month. Start by listing your monthly income after taxes. Then list your expenses: fixed expenses such as rent and loan payments stay the same each month, while variable expenses such as groceries and entertainment change. Subtract your expenses from your income; if the result is negative, look for variable expenses to cut. Review your budget every month and adjust it as your income or expenses change.",
      },
    ],
    outline: {
      chapters: [
        {
          title: "Build your first budget",
          goal: "Create a simple monthly budget from your income and expenses.",
          subchapters: [
            { title: "Know your income and expenses", goal: "List your monthly take-home income and sort expenses into fixed and variable." },
            { title: "Balance and review your budget", goal: "Balance income against expenses and review the budget every month." },
          ],
        },
      ],
    },
    courseId: "fakecourse_tiny",
    chapters: [
      {
        order: 1,
        title: "Build your first budget",
        summary: "Create a simple monthly budget from your income and expenses.",
        lessons: [
          { order: 1, title: "Know your income and expenses", summary: "List your monthly take-home income and sort expenses into fixed and variable.", body: "", sourceIds: [] },
          { order: 2, title: "Balance and review your budget", summary: "Balance income against expenses and review the budget every month.", body: "", sourceIds: [] },
        ],
      },
    ],
  };
}
