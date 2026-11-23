import { inflateSync } from "node:zlib";

/**
 * Limits for handing an admin PDF to the model as an inline file part. A PDF over any of them is
 * marked `unreadable` with a reason instead of being attached, because a part the model can't take
 * fails the next model call, and eve stores the part in the session and re-sends it on every later
 * call (spec: "A PDF the model can't take is marked unreadable with a reason, and generation
 * continues").
 *
 * - Pages: Anthropic's API takes at most 100 PDF pages per request (the documented limit for PDF
 *   support at the time of writing; no local eve/Anthropic doc states it, so this is the
 *   conservative value).
 * - Bytes: base64 grows a file by a third and Anthropic caps a whole request at 32 MB, so one PDF
 *   is held to 10 MB and all PDFs attached in a job to 15 MB together (~20 MB of base64), leaving
 *   room for the rest of the conversation.
 */
export const PDF_MODEL_MAX_PAGES = 100;
export const PDF_INLINE_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_JOB_MAX_BYTES = 15 * 1024 * 1024;

const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z0-9])/g;
const OBJECT_STREAM = /\/Type\s*\/ObjStm\b/g;
/** Inflate caps (compressed streams must not expand without bound): per object stream and in total. */
const INFLATE_MAX_BYTES = 16 * 1024 * 1024;
const INFLATE_TOTAL_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Estimates a PDF's page count by counting page objects (`/Type /Page`, not `/Pages`) in the file
 * and inside compressed object streams (PDF 1.5+ keeps page dictionaries there). Incremental
 * updates can count a page twice, which errs on the safe side. Returns null when no page object is
 * found (encrypted or damaged file): the model can't read those either.
 */
export function estimatePdfPages(data: Uint8Array): number | null {
  const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("latin1");
  let pages = count(text, PAGE_OBJECT);
  let inflated = 0;
  OBJECT_STREAM.lastIndex = 0;
  for (let m = OBJECT_STREAM.exec(text); m; m = OBJECT_STREAM.exec(text)) {
    const start = text.indexOf("stream", m.index);
    if (start === -1) break;
    let from = start + "stream".length;
    if (text[from] === "\r") from++;
    if (text[from] === "\n") from++;
    const end = text.indexOf("endstream", from);
    if (end === -1) break;
    if (inflated > INFLATE_TOTAL_MAX_BYTES) break;
    try {
      const objects = inflateSync(data.subarray(from, end), { maxOutputLength: INFLATE_MAX_BYTES });
      inflated += objects.byteLength;
      pages += count(objects.toString("latin1"), PAGE_OBJECT);
    } catch {
      // Not Flate, truncated or over the inflate cap (zip bomb): skip this stream.
    }
    OBJECT_STREAM.lastIndex = end;
  }
  return pages > 0 ? pages : null;
}

function count(text: string, re: RegExp) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}
