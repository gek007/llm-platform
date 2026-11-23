import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineClient, EngineError, engineFromEnv } from "./engine-client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const outline = {
  chapters: [{ title: "Basics", goal: "Learn the basics", subchapters: [{ title: "Intro", goal: "Start" }] }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("course-builder engine client", () => {
  it("posts saveOutline to <base>/engine/saveOutline with the bearer secret", async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }));
    const engine = createEngineClient({ baseUrl: "https://x.convex.site/", secret: "shh", fetch: fetchMock });
    await expect(engine.saveOutline({ jobId: "j1", outline })).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.convex.site/engine/saveOutline");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer shh");
    expect(JSON.parse(init.body as string)).toEqual({ jobId: "j1", outline });
  });

  it("throws EngineError carrying the server's full error string on { ok: false }", async () => {
    const engine = createEngineClient({
      baseUrl: "https://x.convex.site",
      secret: "shh-secret",
      fetch: async () => json(400, { ok: false, error: "Unknown reference: https://made.up/page" }),
    });
    const err = await engine.saveSubchapter({
      jobId: "j1",
      chapterOrder: 1,
      subchapterOrder: 1,
      title: "T",
      summary: "S",
      body: "B",
      durationMinutes: 5,
      sourceIds: [],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as Error).message).toBe("Unknown reference: https://made.up/page");
    expect(String(err)).not.toContain("shh-secret");
  });

  it("returns op results without the ok flag", async () => {
    const brief = { jobId: "j1", status: "researching", topic: "Rust", resources: [], sources: [] };
    const engine = createEngineClient({
      baseUrl: "https://x.convex.site",
      secret: "s",
      fetch: async () => json(200, { ok: true, ...brief }),
    });
    await expect(engine.getJob({ jobId: "j1" })).resolves.toEqual(brief);
  });

  it("engineFromEnv derives the site URL from NEXT_PUBLIC_CONVEX_URL and reads COURSE_ENGINE_SECRET", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-otter-1.convex.cloud");
    vi.stubEnv("COURSE_ENGINE_SECRET", "env-secret");
    const fetchMock = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await engineFromEnv().finishJob({ jobId: "j1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://happy-otter-1.convex.site/engine/finishJob");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer env-secret");
  });

  it("engineFromEnv refuses to start without a secret", () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://x.convex.site");
    vi.stubEnv("COURSE_ENGINE_SECRET", "");
    expect(() => engineFromEnv()).toThrow(/COURSE_ENGINE_SECRET/);
  });
});
