import { describe, expect, test } from "vitest";
import { parseResourceBlock, parseYoutubeBlock } from "./embeds";

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
