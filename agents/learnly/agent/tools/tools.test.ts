import { getFunctionName } from "convex/server";
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Args = Record<string, string>;
const responses = new Map<string, (args: Args) => unknown>();
const authSet: string[] = [];
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth(t: string) {
      authSet.push(t);
    }
    async query(ref: never, args: Args) {
      const fn = responses.get(getFunctionName(ref));
      if (!fn) throw new Error("unexpected query " + getFunctionName(ref));
      return fn(args);
    }
  },
}));

import getCourseDetails from "./get_course_details";
import getLesson from "./get_lesson";
import getMyProgress from "./get_my_progress";
import listCourses from "./list_courses";
import showQuiz from "./show_quiz";

const exp = String(Math.floor(Date.now() / 1000) + 60);
function ctx(attrs: Record<string, string> | null = { convexToken: "tok", tokenExp: exp }): ToolContext {
  return {
    session: {
      auth: {
        current: attrs
          ? { authenticator: "clerk", principalId: "user_1", principalType: "user", attributes: attrs }
          : null,
      },
    },
  } as unknown as ToolContext;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const run = async (tool: { execute: (i: never, c: ToolContext) => unknown }, input: unknown, c = ctx()) =>
  (await tool.execute(input as never, c)) as Record<string, any>

beforeEach(() => {
  responses.clear();
  authSet.length = 0;
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://x.convex.cloud";
});

describe("tools act as the verified user", () => {
  test("every tool refuses without a verified token", async () => {
    for (const [tool, input] of [
      [listCourses, {}],
      [getCourseDetails, { slug: "a" }],
      [getMyProgress, {}],
      [getLesson, { courseSlug: "a", lessonSlug: "b" }],
    ] as const) {
      expect((await run(tool, input, ctx(null))).ok).toBe(false);
    }
  });

  test("expired token is refused", async () => {
    const r = await run(listCourses, {}, ctx({ convexToken: "tok", tokenExp: "1" }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/expired/);
  });

  test("list_courses forwards the user's token and maps courses", async () => {
    responses.set("courses:listPublished", () => [
      { slug: "a", title: "A", summary: "s", level: "beginner", tier: "pro", tags: [], lessonCount: 2, durationMinutes: 9, description: "secret" },
    ]);
    const r = await run(listCourses, {});
    expect(authSet).toEqual(["tok"]);
    expect(r.courses).toEqual([
      { slug: "a", title: "A", summary: "s", level: "beginner", tier: "pro", tags: [], lessonCount: 2, durationMinutes: 9 },
    ]);
  });

  test("get_course_details returns lock status and hides unpublished", async () => {
    responses.set("courses:getBySlug", ({ slug }: Args) =>
      slug === "draft"
        ? { status: "draft" }
        : { slug, title: "T", summary: "s", description: "d", level: "beginner", tier: "pro", status: "published", tags: [], outcomes: [],
            lessons: [{ order: 1, slug: "l1", title: "L1", summary: "x", durationMinutes: 3, isFreePreview: true, locked: false },
                      { order: 2, slug: "l2", title: "L2", summary: "y", durationMinutes: 4, isFreePreview: false, locked: true }] },
    );
    const r = await run(getCourseDetails, { slug: "t" });
    expect(r.course.lessons.map((l: { locked: boolean }) => l.locked)).toEqual([false, true]);
    expect((await run(getCourseDetails, { slug: "draft" })).found).toBe(false);
  });

  test("get_my_progress combines enrollments and completed lessons", async () => {
    responses.set("enrollments:listMine", () => [
      { _id: "c1", slug: "a", title: "A", tier: "free", lessonCount: 2, completedCount: 1, nextLessonSlug: "l2" },
    ]);
    responses.set("courses:getBySlug", () => ({
      lessons: [{ _id: "x1", slug: "l1", title: "L1" }, { _id: "x2", slug: "l2", title: "L2" }],
    }));
    responses.set("progress:forCourse", () => ["x1"]);
    const r = await run(getMyProgress, {});
    expect(r.courses[0]).toMatchObject({
      finished: false,
      completedLessons: [{ slug: "l1", title: "L1" }],
      remainingLessons: [{ slug: "l2", title: "L2" }],
    });
  });

  test("get_lesson returns the body only when unlocked", async () => {
    const base = { course: { title: "C" }, prev: null, next: null };
    responses.set("lessons:getForViewer", ({ lessonSlug }: Args) =>
      lessonSlug === "open"
        ? { ...base, locked: false, lesson: { title: "Open", summary: "s", body: "# hi" } }
        : { ...base, locked: true, lesson: { title: "Closed", summary: "s" } },
    );
    expect((await run(getLesson, { courseSlug: "c", lessonSlug: "open" })).body).toBe("# hi");
    const locked = await run(getLesson, { courseSlug: "c", lessonSlug: "closed" });
    expect(locked.locked).toBe(true);
    expect(locked.body).toBeUndefined();
  });

  test("show_quiz validates the answer index", async () => {
    const good = await run(showQuiz, { question: "q", options: ["a", "b"], answer: 1 });
    expect(good.shown).toBe(true);
    expect((await run(showQuiz, { question: "q", options: ["a", "b"], answer: 5 })).shown).toBe(false);
  });
});
