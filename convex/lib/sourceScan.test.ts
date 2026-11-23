import { describe, expect, it } from "vitest";
import { findUnknownRefs, normalizeUrl } from "./sourceScan";

const VIDEO = "dQw4w9WgXcQ";
const known = {
  urls: new Set(["https://docs.example.com/guide", "https://example.org"]),
  videoIds: new Set([VIDEO]),
  resourceIds: new Set(["res_1"]),
};
const scan = (md: string) => findUnknownRefs(md, known);
const fence = (lang: string, json: object) => "```" + lang + "\n" + JSON.stringify(json) + "\n```";

describe("normalizeUrl", () => {
  it("strips the fragment and trailing slashes, lowercases scheme and host", () => {
    expect(normalizeUrl("HTTPS://Docs.Example.com/guide/#intro")).toBe("https://docs.example.com/guide");
    expect(normalizeUrl("https://example.org/")).toBe("https://example.org");
    expect(normalizeUrl("https://example.org/?q=1#x")).toBe("https://example.org/?q=1");
  });
  it("returns null for anything that is not an absolute http(s) URL", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("/relative")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("findUnknownRefs", () => {
  it("accepts known URLs with a trailing slash or a fragment", () => {
    expect(scan("See [the guide](https://docs.example.com/guide/).")).toEqual([]);
    expect(scan("See [the guide](https://docs.example.com/guide#setup).")).toEqual([]);
    expect(scan("Bare: https://example.org/, and more.")).toEqual([]);
  });

  it("reports unknown link, bare, autolink and reference-style URLs", () => {
    expect(scan("[x](https://evil.example/p)")).toEqual(["https://evil.example/p"]);
    expect(scan("Visit https://evil.example/bare.")).toEqual(["https://evil.example/bare"]);
    expect(scan("Visit <https://evil.example/auto>")).toEqual(["https://evil.example/auto"]);
    expect(scan("[x][ref]\n\n[ref]: https://evil.example/def")).toEqual(["https://evil.example/def"]);
    expect(scan("![img](https://evil.example/pixel.png)")).toEqual(["https://evil.example/pixel.png"]);
  });

  it("catches uppercase schemes, www autolinks and URLs hidden in link text or titles", () => {
    expect(scan("[x](HTTPS://EVIL.example/up)")).toEqual(["HTTPS://EVIL.example/up"]);
    expect(scan("Go to www.evil.example today")).toEqual(["http://www.evil.example"]);
    expect(scan("[https://evil.example/t](https://example.org)")).toEqual(["https://evil.example/t"]);
    expect(scan('[x](https://example.org "https://evil.example/title")')).toEqual([
      "https://evil.example/title",
    ]);
  });

  it("rejects off-site links without an http(s) scheme, allows in-site relative links", () => {
    expect(scan("[x](//evil.example/a)")).toEqual(["//evil.example/a"]);
    expect(scan("[x](/\\evil.example/a)")).toEqual(["/\\evil.example/a"]);
    expect(scan("[x](mailto:someone@evil.example)")).toEqual(["mailto:someone@evil.example"]);
    expect(scan("[x](javascript:alert(1))")).toEqual(["javascript:alert(1)"]);
    expect(scan("[next](/courses/rag/lessons/lesson-1-2) and [top](#intro)")).toEqual([]);
  });

  it("keeps balanced parentheses and strips trailing punctuation from bare URLs", () => {
    const k = { ...known, urls: new Set(["https://en.wikipedia.org/wiki/Foo_(bar)"]) };
    expect(findUnknownRefs("See https://en.wikipedia.org/wiki/Foo_(bar).", k)).toEqual([]);
    expect(findUnknownRefs("(see https://en.wikipedia.org/wiki/Foo_(bar))", k)).toEqual([]);
  });

  it("checks youtube block video ids and youtube links by id", () => {
    expect(scan(fence("youtube", { videoId: VIDEO, title: "Known" }))).toEqual([]);
    expect(scan(fence("youtube", { videoId: "aaaaaaaaaaa", title: "Other" }))).toEqual([
      "youtube:aaaaaaaaaaa",
    ]);
    expect(scan(`[watch](https://youtu.be/${VIDEO})`)).toEqual([]);
  });

  it("checks resource block ids", () => {
    expect(scan(fence("resource", { resourceId: "res_1" }))).toEqual([]);
    expect(scan(fence("resource", { resourceId: "res_9" }))).toEqual(["resource:res_9"]);
  });

  it("ignores URLs inside ordinary code, scans raw HTML, reports each ref once", () => {
    expect(scan("```ts\nfetch('http://localhost:3000/api')\n```\n\n`https://x.example`")).toEqual([]);
    expect(scan('<a href="https://evil.example/html">x</a>')).toEqual(["https://evil.example/html"]);
    expect(scan("[a](https://evil.example/1) [b](https://evil.example/1)")).toEqual([
      "https://evil.example/1",
    ]);
  });
});
