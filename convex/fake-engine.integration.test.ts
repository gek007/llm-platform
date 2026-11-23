/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  runFakeEngine,
  type EngineCall,
} from "../src/lib/course-builder/fake-engine";

/** R7: the canned course must pass the real /engine/* validation, end to end through convex-test. */

const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const issuer = "https://example.clerk.accounts.dev";
const SECRET = "test-engine-secret-not-real";

beforeEach(() => {
  vi.stubEnv("COURSE_ENGINE_SECRET", SECRET);
});

describe("fake engine against the real engine API", () => {
  it("research + approve + write ends with a ready job, then regenerate returns to ready", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity({
      subject: "admin_1",
      issuer,
      metadata: { role: "admin" },
    });
    const call: EngineCall = async (op, body) => {
      const res = await t.fetch(`/engine/${op}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error);
      return json;
    };

    const jobId = await admin.mutation(api.generation.createJob, {
      topic: "Intro to RAG",
      language: "en",
      level: "beginner",
      length: "short",
    });
    await admin.mutation(api.generation.addResource, {
      jobId,
      kind: "url",
      url: "https://example.org/doc",
    });
    await admin.mutation(api.generation.addResource, {
      jobId,
      kind: "text",
      text: "Some notes",
    });
    await admin.mutation(api.generation.startJob, { jobId });

    await runFakeEngine({ action: "research", jobId }, call);
    expect((await admin.query(api.generation.get, { jobId }))?.status).toBe(
      "outline_ready",
    );

    await admin.mutation(api.generation.approveOutline, { jobId });
    await runFakeEngine({ action: "write", jobId }, call);
    const done = await admin.query(api.generation.get, { jobId });
    expect(done?.status).toBe("ready");
    expect(done?.error).toBeUndefined();

    const counts = await t.run(async (ctx) => ({
      lessons: (await ctx.db.query("lessons").collect()).filter(
        (l) => l.body.trim() !== "",
      ).length,
      decks: (await ctx.db.query("slideDecks").collect()).length,
      tests: (await ctx.db.query("chapterTests").collect()).length,
    }));
    expect(counts).toEqual({ lessons: 4, decks: 2, tests: 2 });

    await admin.mutation(api.generation.requestRegenerate, { jobId });
    await runFakeEngine(
      {
        action: "regenerate",
        jobId,
        target: { kind: "chapter", chapterOrder: 2 },
        instruction: "more examples",
      },
      call,
    );
    expect((await admin.query(api.generation.get, { jobId }))?.status).toBe(
      "ready",
    );
  });
});
