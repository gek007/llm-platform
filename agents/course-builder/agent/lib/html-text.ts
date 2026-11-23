/**
 * Turns an HTML page into readable plain text for the model: drops scripts, styles and other
 * non-content elements, keeps headings, paragraphs and list items on their own lines, decodes
 * entities and collapses whitespace. Prefers the page's `<main>` (or `<article>`) when it has one.
 * Deliberately small (no DOM): good enough for articles and docs pages; the model copes with
 * leftover navigation text.
 *
 * Pages are untrusted and up to 5 MB, so every step is linear in the page size: tag patterns stop
 * at the next `<` (`[^<>]*`), and unclosed elements and comments are cut with forward searches,
 * never with a lazy `[\s\S]*?` that would rescan the rest of the page for each opening tag.
 */

const DROP_TAGS = "script|style|noscript|template|svg|canvas|iframe|object|head|nav|footer|form|select";
const BLOCK_END = /<\/(p|div|section|article|main|header|aside|h[1-6]|dt|dd|tr|blockquote|pre|figure|figcaption|table|ul|ol)\s*>/gi;
const TAG = /<[^<>]*>/g;
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  euro: "€",
  pound: "£",
  middot: "·",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function htmlTitle(html: string): string | undefined {
  const open = /<title\b[^<>]*>/i.exec(html);
  if (!open) return undefined;
  const start = open.index + open[0].length;
  const close = searchFrom(html, /<\/title/gi, start);
  const raw = html.slice(start, close === -1 ? start + 500 : Math.min(close, start + 2000));
  return decodeEntities(raw.replace(TAG, "")).replace(/\s+/g, " ").trim() || undefined;
}

/** Index of the first match of the global regex `re` at or after `from`, or -1. */
function searchFrom(s: string, re: RegExp, from: number): number {
  re.lastIndex = from;
  const m = re.exec(s);
  return m ? m.index : -1;
}

/** The page's main content when it marks it (`<main>`, else `<article>`), else the whole page. */
function mainRegion(html: string): string {
  for (const tag of ["main", "article"]) {
    const open = searchFrom(html, new RegExp(`<${tag}[\\s>]`, "gi"), 0);
    if (open === -1) continue;
    let close = -1;
    const closeRe = new RegExp(`</${tag}`, "gi");
    for (let at = searchFrom(html, closeRe, open); at !== -1; at = searchFrom(html, closeRe, at + 1)) close = at;
    if (close === -1) continue;
    const region = html.slice(open, close);
    if (region.replace(TAG, "").trim().length > 200) return region;
  }
  return html;
}

/** Removes comments and non-content elements with everything inside (to the end if never closed). */
function dropElements(html: string): string {
  const open = new RegExp(`<!--|<(${DROP_TAGS})\\b`, "gi");
  let out = "";
  let last = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    out += html.slice(last, m.index) + " ";
    const closeRe = m[1] ? new RegExp(`</${m[1]}`, "gi") : /-->/g;
    const close = searchFrom(html, closeRe, open.lastIndex);
    const end = close === -1 ? -1 : m[1] ? html.indexOf(">", close) : close + 2;
    last = end === -1 ? html.length : end + 1;
    open.lastIndex = last;
  }
  return out + html.slice(last);
}

export function htmlToText(html: string): string {
  return decodeEntities(
    dropElements(mainRegion(html))
      .replace(/<br\b[^<>]*>/gi, "\n")
      .replace(/<li\b[^<>]*>/gi, "\n- ")
      .replace(/<h([1-6])\b[^<>]*>/gi, (_, n: string) => `\n\n${"#".repeat(Number(n))} `)
      .replace(BLOCK_END, "\n\n")
      .replace(TAG, " "),
  )
    .replace(/[ \t\f\v\r ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
