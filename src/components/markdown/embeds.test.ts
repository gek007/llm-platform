import { describe, expect, test } from "vitest";
import { fenceLanguage, parseResourceBlock, parseYoutubeBlock } from "./embeds";

describe("parseYoutubeBlock", () => {
  test("accepts a valid block with optional start", () => {
    expect(parseYoutubeBlock('{"videoId":"dQw4w9WgXcQ","title":"Intro","start":30}')).toEqual({
      ok: true,
      embed: { videoId: "dQw4w9WgXcQ", title: "Intro", start: 30 },
    });
    const r = parseYoutubeBlock('{"videoId":"dQw4w9WgXcQ","title":"Intro"}');
    expect(r.ok && r.embed.start).toBeUndefined();
  });
  test("rejects bad JSON, bad ids, missing title, bad start", () => {
    for (const body of [
      "{ nope",
      '{"videoId":"short","title":"T"}',
      '{"videoId":"dQw4w9WgXcQ!","title":"T"}',
      '{"videoId":"dQw4w9WgXcQ"}',
      '{"videoId":"dQw4w9WgXcQ","title":"T","start":-1}',
    ]) {
      const r = parseYoutubeBlock(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBeTruthy();
    }
  });
});

describe("parseResourceBlock", () => {
  test("accepts a resourceId", () => {
    expect(parseResourceBlock('{"resourceId":"abc123"}')).toEqual({ ok: true, resourceId: "abc123" });
  });
  test("rejects bad JSON and missing/empty id", () => {
    for (const body of ["x", "{}", '{"resourceId":""}', '{"resourceId":5}']) {
      expect(parseResourceBlock(body).ok).toBe(false);
    }
  });
});

describe("youtubeIdFromUrl", () => {
  const id = "dQw4w9WgXcQ";
  test("extracts from supported forms", async () => {
    const { youtubeIdFromUrl } = await import("./embeds");
    for (const u of [
      `https://www.youtube.com/watch?v=${id}&t=3`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://youtube.com/shorts/${id}`,
    ])
      expect(youtubeIdFromUrl(u)).toBe(id);
  });
  test("rejects others", async () => {
    const { youtubeIdFromUrl } = await import("./embeds");
    expect(youtubeIdFromUrl("https://youtube.com/watch?v=short")).toBeNull();
    expect(youtubeIdFromUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeIdFromUrl("nope")).toBeNull();
  });
});

describe("fenceLanguage", () => {
  test("is the first whitespace-separated token when it is all word characters or dashes", () => {
    expect(fenceLanguage("youtube")).toBe("youtube");
    expect(fenceLanguage('youtube {"a":1}')).toBe("youtube");
    expect(fenceLanguage("  resource\t")).toBe("resource");
    expect(fenceLanguage("x-youtube")).toBe("x-youtube");
    expect(fenceLanguage("YOUTUBE")).toBe("YOUTUBE");
  });
  test("is null for empty info or a token with other characters", () => {
    expect(fenceLanguage(undefined)).toBeNull();
    expect(fenceLanguage(null)).toBeNull();
    expect(fenceLanguage("   ")).toBeNull();
    expect(fenceLanguage("youtube.x")).toBeNull();
    expect(fenceLanguage(".language-youtube")).toBeNull();
    expect(fenceLanguage("c++")).toBeNull();
  });
});
