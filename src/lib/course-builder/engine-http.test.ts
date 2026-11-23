import { describe, expect, it, vi } from "vitest";
import { createEngineHttp } from "./engine-http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("engineHttp", () => {
  it("posts to /engine/<op> with the bearer secret and returns the body", async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true, sources: [] }));
    const http = createEngineHttp({
      baseUrl: "https://x.convex.site/",
      secret: "shh",
      fetch: fetchMock,
    });
    await expect(http("saveSources", { a: 1 })).resolves.toEqual({
      ok: true,
      sources: [],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://x.convex.site/engine/saveSources");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer shh",
    );
    expect(init.body).toBe('{"a":1}');
  });

  it("throws an Error carrying the server's full error string, never the secret", async () => {
    const http = createEngineHttp({
      baseUrl: "https://x.convex.site",
      secret: "shh-secret",
      fetch: async () =>
        json(400, {
          ok: false,
          error: "INVALID: a deck needs 6-12 slides, got 2",
        }),
    });
    const err = await http("saveDeck", {}).catch((e: Error) => e);
    expect((err as Error).message).toBe(
      "INVALID: a deck needs 6-12 slides, got 2",
    );
    expect(String(err)).not.toContain("shh-secret");
  });

  it("throws a status error for non-JSON responses", async () => {
    const http = createEngineHttp({
      baseUrl: "https://x.convex.site",
      secret: "s",
      fetch: async () => new Response("bad gateway", { status: 502 }),
    });
    await expect(http("getJob", {})).rejects.toThrow(/502/);
  });

  it("refuses to run without configuration", async () => {
    const http = createEngineHttp({ baseUrl: "", secret: "" });
    await expect(http("getJob", {})).rejects.toThrow(/not configured/);
  });
});
