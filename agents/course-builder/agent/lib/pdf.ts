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

/**
 * Work limits for the page scan (compressed streams must not expand without bound, and a crafted
 * file must not make the agent inflate forever). `totalBytes` counts work attempted, not just work
 * that succeeded: a stream that hits its output cap is charged the cap it was given. A real
 * 142-page, 3 MB PDF (IRS Publication 17) has 823 object streams inflating to 6 MB in total, so
 * these limits leave ample room for real documents.
 */
export type PdfScanLimits = { perStreamBytes: number; totalBytes: number; maxStreams: number };
export const PDF_SCAN_LIMITS: PdfScanLimits = {
  perStreamBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  maxStreams: 2048,
};

export type PdfScan = {
  /** Page objects found (a lower bound when `complete` is false). */
  pages: number;
  /** Object streams handed to inflate. */
  streamsTried: number;
  /** Inflate budget charged, never above `limits.totalBytes`. */
  inflateBytesCharged: number;
  /** False when the scan stopped early at a limit (or on a truncated stream). */
  complete: boolean;
};

/**
 * Counts page objects (`/Type /Page`, not `/Pages`) in the file and inside FlateDecode object
 * streams (`/Type /ObjStm`; PDF 1.5+ keeps page dictionaries there), within `limits`.
 */
export function scanPdfPages(data: Uint8Array, limits: PdfScanLimits = PDF_SCAN_LIMITS): PdfScan {
  const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("latin1");
  const scan: PdfScan = { pages: count(text, PAGE_OBJECT), streamsTried: 0, inflateBytesCharged: 0, complete: true };
  OBJECT_STREAM.lastIndex = 0;
  for (let m = OBJECT_STREAM.exec(text); m; m = OBJECT_STREAM.exec(text)) {
    const remaining = limits.totalBytes - scan.inflateBytesCharged;
    if (scan.streamsTried >= limits.maxStreams || remaining <= 0) {
      scan.complete = false;
      break;
    }
    const start = text.indexOf("stream", m.index);
    let from = start + "stream".length;
    if (text[from] === "\r") from++;
    if (text[from] === "\n") from++;
    const end = start === -1 ? -1 : text.indexOf("endstream", from);
    if (end === -1) {
      scan.complete = false;
      break;
    }
    const cap = Math.min(limits.perStreamBytes, remaining);
    const input = data.subarray(from, end);
    scan.streamsTried++;
    try {
      const objects = inflateSync(input, { maxOutputLength: cap });
      scan.inflateBytesCharged += objects.byteLength;
      scan.pages += count(objects.toString("latin1"), PAGE_OBJECT);
    } catch (err) {
      // Over the output cap (a zip bomb, or simply out of budget): charge the whole cap. Any other
      // failure (not Flate, corrupt) costs about the input's size; skip the stream.
      const overCap = (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE";
      scan.inflateBytesCharged += overCap ? cap : Math.min(input.byteLength, cap);
      if (overCap) scan.complete = false;
    }
    OBJECT_STREAM.lastIndex = end;
  }
  return scan;
}

/**
 * The PDF's page count for the model-limit check, or null when it can't be trusted: no page
 * object found (encrypted or damaged), or the scan stopped at a work limit before reaching the
 * page limit. Incremental updates can count a page twice, which errs on the safe side.
 */
export function estimatePdfPages(data: Uint8Array, limits: PdfScanLimits = PDF_SCAN_LIMITS): number | null {
  const scan = scanPdfPages(data, limits);
  if (scan.pages > PDF_MODEL_MAX_PAGES) return scan.pages; // over the limit whatever the rest holds
  if (!scan.complete || scan.pages === 0) return null;
  return scan.pages;
}

function count(text: string, re: RegExp) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}
