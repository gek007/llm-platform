import type { Question } from "../../../convex/lib/engineTypes";
import type { EngineCommand } from "./commands";
import { engineHttp, type EngineHttp } from "./engine-http";
import { fakeDeck } from "./fake-deck";

/**
 * Fake engine: does what the real agent does, through the same `/engine/*` API, with canned
 * content (for E2E and offline demos). Because it goes through `engineHttp`, the canned content
 * must pass the real validation (slide/question counts, "no invented links", state rules); the
 * convex-test integration test in convex/fake-engine.integration.test.ts proves that.
 *
 * Content is English whatever the job's language (nice-to-have left out). Each phase runs as a
 * single awaited call: the canned course is ~20 small requests, and the admin live view reads
 * progress reactively from Convex either way.
 */

export type EngineCall = EngineHttp;

type JobView = {
  topic: string;
  resources: { id: string; readStatus: string }[];
  sources: { id: string }[];
  course?: {
    chapters: {
      order: number;
      title: string;
      subchapters: { order: number; title: string }[];
    }[];
  };
};

const SOURCES = [
  {
    url: "https://en.wikipedia.org/wiki/Information_retrieval",
    title: "Information retrieval overview",
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Learn",
    title: "MDN learning area",
  },
  { url: "https://docs.github.com/en", title: "GitHub documentation" },
];

const OUTLINE = {
  chapters: [
    {
      title: "Foundations",
      goal: "Understand the core ideas and vocabulary.",
      subchapters: [
        { title: "What it is", goal: "Define the topic in plain words." },
        { title: "Why it matters", goal: "See where it is used in practice." },
      ],
    },
    {
      title: "Putting it to work",
      goal: "Apply the ideas to a small, realistic task.",
      subchapters: [
        { title: "A first example", goal: "Walk through a minimal example." },
        {
          title: "Common pitfalls",
          goal: "Recognise and avoid typical mistakes.",
        },
      ],
    },
  ],
};

async function getJob(call: EngineCall, jobId: string): Promise<JobView> {
  return (await call("getJob", { jobId })) as JobView;
}

const progress = (
  call: EngineCall,
  jobId: string,
  message: string,
  chapterOrder?: number,
) =>
  call("reportProgress", {
    jobId,
    kind: chapterOrder ? "chapter" : "info",
    message,
    chapterOrder,
  });

async function research(call: EngineCall, jobId: string) {
  const job = await getJob(call, jobId);
  await progress(call, jobId, "Reading the provided resources");
  for (const r of job.resources) {
    if (r.readStatus === "pending") {
      await call("setResourceStatus", {
        jobId,
        resourceId: r.id,
        readStatus: "read",
      });
    }
  }
  await progress(call, jobId, "Searching for sources");
  await call("saveSources", {
    jobId,
    sources: SOURCES.map((s) => ({ ...s, kind: "web" })),
  });
  // reportProgress is refused once the job is outline_ready, so it goes before the outline.
  await progress(call, jobId, "Drafting the outline");
  await call("saveOutline", { jobId, outline: OUTLINE });
}

function subchapterBody(chapter: string, title: string): string {
  const quiz = {
    question: `Which statement best matches "${title}"?`,
    options: [
      "It is only theory",
      "It combines ideas with practice",
      "It is unrelated to the course",
    ],
    answer: 1,
    explanation: "Each lesson pairs an idea with something you can try.",
  };
  return [
    `## ${title}`,
    "",
    `This lesson belongs to the chapter "${chapter}". It introduces the main idea in plain words and shows how it connects to the rest of the course [1].`,
    "",
    "- Start from a small, concrete example.",
    "- Name each moving part before combining them.",
    "- Check your understanding often [2].",
    "",
    "Practice: pick the best answer below.",
    "",
    "```quiz",
    JSON.stringify(quiz),
    "```",
    "",
  ].join("\n");
}

const sourceIds = (job: JobView) => job.sources.map((s) => s.id);

async function writeSubchapter(
  call: EngineCall,
  job: JobView,
  jobId: string,
  chapter: NonNullable<JobView["course"]>["chapters"][number],
  sub: { order: number; title: string },
) {
  await call("saveSubchapter", {
    jobId,
    chapterOrder: chapter.order,
    subchapterOrder: sub.order,
    title: sub.title,
    summary: `A short lesson on ${sub.title.toLowerCase()}.`,
    body: subchapterBody(chapter.title, sub.title),
    durationMinutes: 8,
    sourceIds: sourceIds(job),
  });
}

function test(chapterOrder: number): Question[] {
  const single = (
    i: number,
    prompt: string,
    options: string[],
    correct: number,
  ): Question => ({
    id: `c${chapterOrder}q${i}`,
    kind: "single",
    prompt,
    options,
    correct: [correct],
    explanation: `The correct choice is "${options[correct]}".`,
  });
  const tf = (i: number, prompt: string, truth: boolean): Question => ({
    id: `c${chapterOrder}q${i}`,
    kind: "true_false",
    prompt,
    options: ["True", "False"],
    correct: [truth ? 0 : 1],
    explanation: truth ? "That statement is true." : "That statement is false.",
  });
  const multiple = (
    i: number,
    prompt: string,
    options: string[],
    correct: number[],
  ): Question => ({
    id: `c${chapterOrder}q${i}`,
    kind: "multiple",
    prompt,
    options,
    correct,
    explanation: "Select every option that applies; all of them must be right.",
  });
  return [
    single(
      1,
      "What is a good first step with a new problem?",
      ["Start small", "Change everything", "Skip it"],
      0,
    ),
    single(
      2,
      "Why verify each step?",
      ["To catch mistakes early", "To slow down", "It is optional"],
      0,
    ),
    tf(3, "Examples help ideas stick.", true),
    tf(4, "Skipping the basics speeds up learning.", false),
    multiple(
      5,
      "Which are good habits?",
      ["Test small pieces", "Write things down", "Guess blindly"],
      [0, 1],
    ),
    single(
      6,
      "Which pairing describes this course?",
      ["Ideas with practice", "Theory only", "Practice only"],
      0,
    ),
    tf(7, "Changing many things at once makes problems easier to find.", false),
    multiple(
      8,
      "Which are common mistakes?",
      ["Rushing setup", "Skipping basics", "Checking work"],
      [0, 1],
    ),
  ];
}

const chapterOf = (job: JobView, order: number) => {
  const chapter = job.course?.chapters.find((c) => c.order === order);
  if (!chapter)
    throw new Error(`NOT_FOUND: chapter ${order} is not in the job's course`);
  return chapter;
};

async function writeChapterExtras(
  call: EngineCall,
  jobId: string,
  chapter: { order: number; title: string },
) {
  await call("saveDeck", {
    jobId,
    chapterOrder: chapter.order,
    title: chapter.title,
    slides: fakeDeck(chapter.title),
  });
  await call("saveTest", {
    jobId,
    chapterOrder: chapter.order,
    questions: test(chapter.order),
  });
}

async function write(call: EngineCall, jobId: string) {
  const job = await getJob(call, jobId);
  for (const chapter of job.course?.chapters ?? []) {
    await progress(
      call,
      jobId,
      `Writing chapter ${chapter.order}: ${chapter.title}`,
      chapter.order,
    );
    for (const sub of chapter.subchapters)
      await writeSubchapter(call, job, jobId, chapter, sub);
    await writeChapterExtras(call, jobId, chapter);
  }
  await call("finishJob", { jobId });
}

async function regenerate(
  call: EngineCall,
  cmd: Extract<EngineCommand, { action: "regenerate" }>,
) {
  const { jobId, target } = cmd;
  const job = await getJob(call, jobId);
  const chapter = chapterOf(job, target.chapterOrder);
  await progress(
    call,
    jobId,
    `Regenerating ${target.kind} in chapter ${chapter.order}`,
    chapter.order,
  );
  if (target.kind === "subchapter") {
    const sub = chapter.subchapters.find(
      (s) => s.order === target.subchapterOrder,
    );
    if (!sub)
      throw new Error(
        `NOT_FOUND: subchapter ${chapter.order}.${target.subchapterOrder}`,
      );
    await writeSubchapter(call, job, jobId, chapter, sub);
  } else if (target.kind === "deck") {
    await call("saveDeck", {
      jobId,
      chapterOrder: chapter.order,
      title: chapter.title,
      slides: fakeDeck(chapter.title),
    });
  } else if (target.kind === "test") {
    await call("saveTest", {
      jobId,
      chapterOrder: chapter.order,
      questions: test(chapter.order),
    });
  } else {
    for (const sub of chapter.subchapters)
      await writeSubchapter(call, job, jobId, chapter, sub);
    await writeChapterExtras(call, jobId, chapter);
  }
  await call("finishJob", { jobId });
}

/** Runs one command's phase to completion and returns the fake session id. Throws on any engine error. */
export async function runFakeEngine(
  cmd: EngineCommand,
  call: EngineCall = engineHttp,
): Promise<{ sessionId: string }> {
  if (cmd.action === "research") await research(call, cmd.jobId);
  else if (cmd.action === "write") await write(call, cmd.jobId);
  else await regenerate(call, cmd);
  return { sessionId: `fake-${cmd.jobId}` };
}
