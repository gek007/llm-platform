/// <reference types="vite/client" />
// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { sendToAgent } from "../src/lib/course-builder/eve-client";
import type { EngineCommand } from "../src/lib/course-builder/commands";

/**
 * Live end-to-end check of course creation, opt-in (`npm run verify:live-pipeline`; costs real
 * Opus tokens and 10–30 minutes). The real `course-builder` agent (`eve dev`, real model, real web
 * research) writes through a local HTTP server that forwards `/engine/*` into convex-test, so every
 * write goes through the real Convex functions, validation, source scan and state machine. Admin
 * steps run as a convex-test admin identity, dispatch mirrors the API route (setPendingCommand →
 * sendToAgent → markDispatched), and the finished course is published and completed by a learner.
 * No Clerk users and no Convex deployment are involved. Secrets are read from .env.local and passed
 * to the child process; they are never logged.
 *
 * Env: LIVE_PIPELINE=1 (required), LIVE_TOPIC, LIVE_LANGUAGE (en|he|ru), LIVE_RESOURCE_URL ("" for
 * none), LIVE_PORT (default 2002),
 * LIVE_PIPELINE_OUT (summary JSON path).
 */

const LIVE = process.env.LIVE_PIPELINE === "1";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const issuer = "https://example.clerk.accounts.dev";
const MIN = 60_000;

function envLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: Server | undefined;
let agent: ChildProcess | undefined;
afterAll(async () => {
  agent?.kill("SIGTERM");
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
});

describe.skipIf(!LIVE)("live course pipeline (real agent, real Convex functions)", () => {
  it(
    "research → approve → write → ready → publish → learner completes",
    async () => {
      const env = envLocal();
      const engineSecret = env.COURSE_ENGINE_SECRET;
      const channelSecret = env.COURSE_BUILDER_CHANNEL_SECRET;
      expect(engineSecret, "COURSE_ENGINE_SECRET in .env.local").toBeTruthy();
      expect(channelSecret, "COURSE_BUILDER_CHANNEL_SECRET in .env.local").toBeTruthy();
      expect(env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY").toBeTruthy();
      vi.stubEnv("COURSE_ENGINE_SECRET", engineSecret);

      const t = convexTest(schema, modules);
      const admin = t.withIdentity({ subject: "admin_live", issuer, metadata: { role: "admin" } });
      const learner = t.withIdentity({ subject: "learner_live", issuer });
      const log: string[] = [];
      const note = (s: string) => log.push(`${new Date().toISOString()} ${s}`);
      const engineCalls: Record<string, { ok: number; refused: number }> = {};

      // 1. Engine HTTP harness → convex-test.
      server = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const op = (req.url ?? "").replace(/^\/engine\//, "");
        try {
          const r = await t.fetch(req.url ?? "/", {
            method: req.method,
            headers: {
              "content-type": req.headers["content-type"] ?? "application/json",
              authorization: req.headers.authorization ?? "",
            },
            body: req.method === "GET" ? undefined : Buffer.concat(chunks).toString("utf8"),
          });
          const text = await r.text();
          const tally = (engineCalls[op] ??= { ok: 0, refused: 0 });
          let ok = r.ok;
          try {
            ok = ok && (JSON.parse(text) as { ok?: boolean }).ok !== false;
          } catch {
            /* non-JSON */
          }
          if (ok) tally.ok++;
          else {
            tally.refused++;
            note(`engine ${op} refused: ${text.slice(0, 300)}`);
          }
          res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
          res.end(text);
        } catch (err) {
          note(`engine ${op} threw: ${String(err).slice(0, 300)}`);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `INTERNAL: ${String(err)}` }));
        }
      });
      await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
      const engineUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      // 2. The real agent, pointed at the harness.
      const port = Number(process.env.LIVE_PORT ?? 2002);
      const stateDir = mkdtempSync(join(tmpdir(), "live-pipeline-eve-"));
      const agentLog: string[] = [];
      // eve mocks every authored model when NODE_ENV=test (vitest sets it), so the child gets the
      // parent's environment minus the test runner's variables.
      const childEnv = Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => k !== "NODE_ENV" && !k.startsWith("VITEST") && k !== "TEST" && k !== "EVE_MOCK_AUTHORED_MODELS",
        ),
      );
      agent = spawn(
        "npx",
        ["eve", "dev", "--agent", "course-builder", "--no-ui", "--port", String(port)],
        {
          cwd: process.cwd(),
          env: {
            ...childEnv,
            ...env,
            NODE_ENV: "development",
            CONVEX_SITE_URL: engineUrl,
            COURSE_ENGINE_SECRET: engineSecret,
            COURSE_BUILDER_CHANNEL_SECRET: channelSecret,
            EVE_DEV_STATE_DIR: stateDir,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const keep = (b: Buffer) => {
        agentLog.push(b.toString());
        if (agentLog.length > 400) agentLog.splice(0, agentLog.length - 400);
      };
      agent.stdout?.on("data", keep);
      agent.stderr?.on("data", keep);
      const agentBase = `http://127.0.0.1:${port}/eve`;
      const upBy = Date.now() + 3 * MIN;
      for (;;) {
        try {
          await fetch(`${agentBase}/v1/session`, { method: "GET" });
          break;
        } catch {
          if (Date.now() > upBy) throw new Error(`agent did not start:\n${agentLog.join("").slice(-3000)}`);
          await sleep(1000);
        }
      }
      note("agent up");

      // 3. Dispatch like the API route.
      let sessionId: string | undefined;
      const dispatch = async (command: EngineCommand) => {
        await admin.mutation(api.generation.setPendingCommand, { jobId, command });
        const r = await sendToAgent(command, sessionId, { baseUrl: agentBase, secret: channelSecret });
        sessionId = r.sessionId;
        await admin.mutation(api.generation.markDispatched, { jobId, eveSessionId: r.sessionId });
        note(`dispatched ${command.action}`);
      };
      const seenEvents = new Set<string>();
      const waitFor = async (want: string[], limitMs: number) => {
        const by = Date.now() + limitMs;
        for (;;) {
          const job = await admin.query(api.generation.get, { jobId });
          const events = await admin.query(api.generation.events, { jobId });
          for (const e of events) {
            if (seenEvents.has(e._id)) continue;
            seenEvents.add(e._id);
            note(`event [${e.kind}] ${e.message}`);
          }
          if (job && want.includes(job.status)) return job;
          if (job?.status === "failed") throw new Error(`job failed: ${job.error}\n${log.join("\n")}`);
          const calls = Object.values(engineCalls).reduce((n, c) => n + c.ok + c.refused, 0);
          if (calls === 0 && Date.now() - started > 5 * MIN) {
            throw new Error(`agent made no engine calls in 5 minutes\n${agentLog.join("").slice(-3000)}`);
          }
          if (Date.now() > by) throw new Error(`timed out in ${job?.status}\n${log.join("\n")}`);
          await sleep(5000);
        }
      };

      const started = Date.now();
      const jobId: Id<"generationJobs"> = await admin.mutation(api.generation.createJob, {
        topic: process.env.LIVE_TOPIC ?? "Basics of personal budgeting",
        language: (process.env.LIVE_LANGUAGE as "en" | "he" | "ru" | undefined) ?? "en",
        level: "beginner",
        length: "short",
      });
      const resourceUrl = process.env.LIVE_RESOURCE_URL ?? "https://www.consumerfinance.gov/about-us/blog/budgeting-how-to-create-a-budget-and-stick-with-it/";
      if (resourceUrl) await admin.mutation(api.generation.addResource, { jobId, kind: "url", url: resourceUrl });
      await admin.mutation(api.generation.startJob, { jobId });
      await dispatch({ action: "research", jobId });
      const outlined = await waitFor(["outline_ready"], 20 * MIN);
      const researchMs = Date.now() - started;
      note(`outline: ${outlined.outline?.chapters.map((c) => c.title).join(" | ")}`);

      await admin.mutation(api.generation.approveOutline, { jobId });
      await dispatch({ action: "write", jobId });
      const ready = await waitFor(["ready"], 40 * MIN);
      const totalMs = Date.now() - started;
      const courseId = ready.courseId!;

      // 4. What was stored.
      const stored = await t.run(async (ctx) => {
        const course = (await ctx.db.get(courseId))!;
        const chapters = await ctx.db
          .query("chapters")
          .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
          .collect();
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
          .collect();
        const decks = await ctx.db.query("slideDecks").collect();
        const tests = await ctx.db.query("chapterTests").collect();
        const sources = await ctx.db.query("generationSources").collect();
        return { course, chapters, lessons, decks, tests, sources };
      });
      expect(stored.course.status).toBe("draft");
      expect(stored.chapters.length).toBeGreaterThanOrEqual(2);
      expect(stored.lessons.every((l) => l.body.trim().length > 200)).toBe(true);
      for (const d of stored.decks) expect(d.slides.length).toBeGreaterThanOrEqual(6);
      for (const q of stored.tests) expect(q.questions.length).toBeGreaterThanOrEqual(8);
      expect(stored.decks.length).toBe(stored.chapters.length);
      expect(stored.tests.length).toBe(stored.chapters.length);
      expect(stored.sources.length).toBeGreaterThan(0);
      expect(await learner.query(api.courses.getBySlug, { slug: stored.course.slug })).toBeNull();

      // 5. Publish and learn.
      const c = stored.course;
      await admin.mutation(api.admin.updateCourse, {
        courseId,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        description: c.description,
        level: c.level,
        tier: c.tier,
        status: "published",
        tags: c.tags,
        outcomes: c.outcomes,
        coverImageUrl: c.coverImageUrl,
        order: c.order,
        language: c.language,
      });
      await learner.mutation(api.enrollments.enroll, { courseId });
      for (const chapter of stored.chapters) {
        const page = await learner.query(api.chapters.getForViewer, {
          courseSlug: c.slug,
          chapterSlug: chapter.slug,
        });
        const test = await learner.query(api.tests.getForViewer, { testId: page!.test!._id });
        for (const q of test!.questions) {
          expect(q).not.toHaveProperty("correct");
          expect(q).not.toHaveProperty("explanation");
        }
        const row = stored.tests.find((x) => x._id === test!.testId)!;
        const result = await learner.mutation(api.tests.submit, {
          testId: test!.testId,
          version: test!.version,
          answers: Object.fromEntries(row.questions.map((q) => [q.id, q.correct])),
        });
        expect(result.passed).toBe(true);
      }
      for (const lesson of stored.lessons) {
        await learner.mutation(api.progress.setComplete, { lessonId: lesson._id, complete: true });
      }
      const completion = await learner.query(api.progress.courseCompletion, { courseId });
      expect(completion.complete).toBe(true);

      const summary = {
        topic: process.env.LIVE_TOPIC ?? "Basics of personal budgeting",
        language: c.language,
        title: c.title,
        slug: c.slug,
        researchMinutes: +(researchMs / MIN).toFixed(1),
        totalMinutes: +(totalMs / MIN).toFixed(1),
        usage: ready.usage ?? null,
        chapters: stored.chapters.map((ch) => ({
          title: ch.title,
          lessons: stored.lessons.filter((l) => l.chapterId === ch._id).map((l) => l.title),
          slides: stored.decks.find((d) => d.chapterId === ch._id)?.slides.length,
          questions: stored.tests.find((x) => x.chapterId === ch._id)?.questions.length,
        })),
        sources: stored.sources.map((s) => `${s.kind} ${s.url}`),
        engineCalls,
        completion,
        log,
        sampleLesson: stored.lessons[0]?.body.slice(0, 1500),
      };
      if (process.env.LIVE_PIPELINE_OUT) {
        writeFileSync(process.env.LIVE_PIPELINE_OUT, JSON.stringify(summary, null, 2));
      }
    },
    75 * MIN,
  );
});
