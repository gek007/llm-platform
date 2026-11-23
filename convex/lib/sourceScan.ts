import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  fenceLanguage,
  parseResourceBlock,
  parseYoutubeBlock,
  youtubeIdFromUrl,
} from "../../src/components/markdown/embeds";

/**
 * "No invented links": finds every reference in lesson markdown that the job has not seen.
 *
 * The markdown is parsed with the same pipeline the renderer uses (remark-parse + remark-gfm, as in
 * react-markdown), so what is checked is what would render:
 * - link / image / reference-definition destinations (incl. `<autolinks>` and GFM bare-URL and
 *   `www.` autolinks). Any destination that leaves the site (http(s), protocol-relative `//x`,
 *   backslash tricks like `/\x`) must be a known URL; other schemes (mailto:, javascript:, data:)
 *   are always reported; in-site relative links (`/courses/…`, `#anchor`) are allowed.
 * - http(s) URLs written as plain text (also in link text, link titles and raw HTML).
 * - ```youtube blocks' `videoId` and ```resource blocks' `resourceId`, parsed with the renderer's
 *   own parsers and fence rule (`fenceLanguage`, src/components/markdown/embeds.ts). Invalid blocks
 *   render as an error box and carry no reference, so they are not reported here.
 * Other code (fenced, indented, inline) never renders as a link and is not scanned, so code samples
 * may show URLs such as http://localhost:3000.
 *
 * Reported refs: URLs as written; `youtube:<id>`; `resource:<id>`. Each ref is reported once.
 */
export type KnownRefs = { urls: Set<string>; videoIds: Set<string>; resourceIds: Set<string> };

/** Comparison key for URLs: absolute http(s) only; lowercased scheme/host, no `#fragment`, no trailing `/`. */
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

// Resolving against a placeholder origin tells in-site links from ones that leave the site exactly
// the way a browser would (`//x`, `/\x`, `\\x`, tabs/newlines inside the scheme, …).
const SITE = new URL("https://lesson.invalid/");
const TEXT_URL = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"*_~]$/;

function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out.at(-1);
    if (last && TRAILING.test(last)) out = out.slice(0, -1);
    else if (last === ")" && count(out, "(") < count(out, ")")) out = out.slice(0, -1);
    else if (last === "]" && count(out, "[") < count(out, "]")) out = out.slice(0, -1);
    else return out;
  }
}
const count = (s: string, ch: string) => s.split(ch).length - 1;

const processor = unified().use(remarkParse).use(remarkGfm);

function checkAbsolute(raw: string, href: string, known: KnownRefs, unknown: Set<string>) {
  const key = normalizeUrl(href);
  if (key && known.urls.has(key)) return;
  const videoId = youtubeIdFromUrl(href);
  if (videoId && known.videoIds.has(videoId)) return;
  unknown.add(raw);
}

/** Every http(s) URL in raw text (any case; trailing punctuation and unbalanced brackets trimmed). */
function scanTextUrls(text: string, known: KnownRefs, unknown: Set<string>) {
  for (const match of text.matchAll(TEXT_URL)) {
    const raw = trimTrailing(match[0]);
    checkAbsolute(raw, raw, known, unknown);
  }
}

/**
 * Plain-text fields (lesson title/summary, slide strings, test prompts/options/explanations): they
 * are not markdown, so the raw string is scanned for http(s) URLs as is — markdown syntax such as
 * backticks or fences in the text hides nothing. Scan each field on its own; never join fields
 * (or a field and the body) into one string, or a fence in one field could swallow the next.
 */
export function findUnknownRefsInText(text: string, known: KnownRefs): string[] {
  const unknown = new Set<string>();
  scanTextUrls(text, known, unknown);
  return [...unknown];
}

/** Lesson markdown (the body only — see findUnknownRefsInText for plain-text fields). */
export function findUnknownRefs(markdown: string, known: KnownRefs): string[] {
  const unknown = new Set<string>();

  const checkDestination = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw, SITE);
    } catch {
      unknown.add(raw);
      return;
    }
    if (url.protocol === SITE.protocol && url.host === SITE.host) return; // in-site relative link
    if (url.protocol !== "http:" && url.protocol !== "https:") unknown.add(raw);
    else checkAbsolute(raw, url.href, known, unknown);
  };
  const scanText = (text: string) => scanTextUrls(text, known, unknown);

  const visit = (node: Nodes) => {
    switch (node.type) {
      case "link":
      case "image":
      case "definition":
        checkDestination(node.url);
        if (node.title) scanText(node.title);
        if (node.type === "image" && node.alt) scanText(node.alt);
        break;
      case "text":
      case "html":
        scanText(node.value);
        break;
      case "code": {
        // Same helper as LessonMarkdown, which sees this as the `language-<lang>` class.
        const lang = fenceLanguage(node.lang);
        if (lang === "youtube") {
          const parsed = parseYoutubeBlock(node.value);
          if (parsed.ok && !known.videoIds.has(parsed.embed.videoId)) {
            unknown.add(`youtube:${parsed.embed.videoId}`);
          }
        } else if (lang === "resource") {
          const parsed = parseResourceBlock(node.value);
          if (parsed.ok && !known.resourceIds.has(parsed.resourceId)) {
            unknown.add(`resource:${parsed.resourceId}`);
          }
        }
        break;
      }
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };

  visit(processor.parse(markdown) as Root);
  return [...unknown];
}
