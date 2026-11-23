import { guardedFetch, GuardedFetchErrorCode, isGuardedFetchError } from "guarded-fetch";
import { PDF_MAX_BYTES } from "../../../../convex/lib/engineTypes";

/**
 * The agent's only way to fetch a URL itself (read_resource pages and PDFs, youtube_info oEmbed).
 * Admin resources and model-chosen URLs are untrusted, so every fetch is SSRF-safe:
 *
 * - https only, on the first URL and on every redirect hop (at most 3, `redirect: "manual"`).
 * - Destinations go through guarded-fetch (Vercel's vetted SSRF guard on undici, a direct
 *   dependency on purpose): IP literals in any spelling (decimal, octal, hex, IPv4-mapped IPv6,
 *   NAT64, 6to4) and hostnames are checked against loopback, private, link-local (cloud metadata),
 *   CGNAT, ULA and other reserved ranges; `localhost`, `*.localhost` and `*.local` are refused by
 *   name; and the address is re-validated inside the socket's DNS lookup, so DNS rebinding between
 *   the check and the connect can't reach an internal host.
 * - The body is streamed with a hard byte cap (PDF 20 MB, text 5 MB, JSON 256 KB) and aborted as soon
 *   as it passes the cap (a larger Content-Length is refused before reading).
 * - Content-Type must match what the caller expects; a PDF must start with the `%PDF` magic bytes.
 * - The caller's abort signal (the turn's `ctx.abortSignal`) and a per-kind timeout bound the
 *   whole fetch, body included.
 *
 * Convex storage file URLs (`fileUrl` from get_job) take the same path: they are public https
 * URLs, so the guard passes them, and the cap and magic-byte checks still apply.
 *
 * Failures throw `SafeFetchError` with a short, model-readable message and a stable `code`.
 */

export const TEXT_MAX_BYTES = 5 * 1024 * 1024;
export const JSON_MAX_BYTES = 256 * 1024;
export const MAX_REDIRECTS = 3;

export type SafeFetchErrorCode =
  | "blocked" // not https, or a private / local / reserved destination (first URL or a redirect)
  | "redirects" // more than MAX_REDIRECTS hops
  | "http" // non-2xx status
  | "too_large"
  | "bad_type" // unexpected Content-Type
  | "not_pdf" // missing %PDF magic bytes
  | "timeout"
  | "aborted"
  | "network";

export class SafeFetchError extends Error {
  override name = "SafeFetchError";
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type FetchDeps = {
  /** Usually the tool's `ctx.abortSignal`. */
  signal?: AbortSignal;
  /** Test seam: an undici-compatible fetch used for the connection (guards still run). */
  fetch?: typeof fetch;
};

type Request = FetchDeps & {
  maxBytes: number;
  timeoutMs: number;
  accept: (contentType: string) => boolean;
  headers?: Record<string, string>;
  /** Only the size is wanted: trust a Content-Length (and skip the body), else count the bytes. */
  sizeOnly?: boolean;
};

const USER_AGENT = "Mozilla/5.0 (compatible; LearnlyCourseBuilder/1.0)";

async function safeFetch(
  rawUrl: string,
  req: Request,
): Promise<{ bytes: Uint8Array; size: number; contentType: string; charset?: string }> {
  // Our own https check first, with a clear message (guarded-fetch checks again on every hop).
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("blocked", `Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:") throw new SafeFetchError("blocked", `Only https:// URLs can be fetched: ${rawUrl}`);

  const timeout = AbortSignal.timeout(req.timeoutMs);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  if (signal.aborted) throw abortError(signal);

  let response: Response;
  try {
    response = await guardedFetch(url, {
      httpsOnly: true,
      maxRedirects: MAX_REDIRECTS,
      timeoutMs: req.timeoutMs,
      signal,
      headers: { "user-agent": USER_AGENT, ...req.headers },
      ...(req.fetch ? { fetch: req.fetch } : {}),
    });
  } catch (err) {
    throw toSafeFetchError(err, signal);
  }

  try {
    if (!response.ok) throw new SafeFetchError("http", `HTTP ${response.status} from ${url.host}`);
    const header = response.headers.get("content-type") ?? "";
    const contentType = header.split(";")[0].trim().toLowerCase();
    const charset = /;\s*charset\s*=\s*"?([\w.:-]+)/i.exec(header)?.[1];
    if (!req.accept(contentType)) {
      throw new SafeFetchError("bad_type", `Unexpected content type "${contentType || "none"}" from ${url.host}`);
    }
    const lengthHeader = response.headers.get("content-length");
    const length = lengthHeader === null ? NaN : Number(lengthHeader);
    if (Number.isFinite(length) && length > req.maxBytes) throw tooLarge(req.maxBytes);
    if (req.sizeOnly && Number.isFinite(length) && length >= 0) {
      await response.body?.cancel().catch(() => {});
      return { bytes: new Uint8Array(), size: length, contentType, charset };
    }
    const bytes = await readCapped(response, req.maxBytes, signal);
    return { bytes, size: bytes.byteLength, contentType, charset };
  } catch (err) {
    await response.body?.cancel().catch(() => {});
    throw err instanceof SafeFetchError ? err : toSafeFetchError(err, signal);
  }
}

/** Reads the body chunk by chunk and cancels the stream as soon as it passes `maxBytes`. */
async function readCapped(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // guarded-fetch stops watching the signal once headers arrive, so the body read watches it
  // itself: an abort or timeout cancels a stalled read (which then resolves `done`).
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw abortError(signal);
      const { done, value } = await reader.read();
      if (signal.aborted) throw abortError(signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw tooLarge(maxBytes);
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function tooLarge(maxBytes: number) {
  return new SafeFetchError("too_large", `The file is larger than ${formatBytes(maxBytes)}`);
}

function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))} MB` : `${Math.round(n / 1024)} KB`;
}

function abortError(signal: AbortSignal) {
  const reason = signal.reason as { name?: string } | undefined;
  return reason?.name === "TimeoutError"
    ? new SafeFetchError("timeout", "The request timed out")
    : new SafeFetchError("aborted", "The request was cancelled");
}

function toSafeFetchError(err: unknown, signal: AbortSignal): SafeFetchError {
  if (err instanceof SafeFetchError) return err;
  if (signal.aborted) return abortError(signal);
  if (isGuardedFetchError(err)) {
    switch (err.code) {
      case GuardedFetchErrorCode.PROTOCOL_NOT_ALLOWED:
      case GuardedFetchErrorCode.HOSTNAME_UNSAFE:
      case GuardedFetchErrorCode.REDIRECT_TO_UNSAFE_HOST:
      case GuardedFetchErrorCode.HOST_NOT_ALLOWED:
      case GuardedFetchErrorCode.INVALID_URL:
        return new SafeFetchError("blocked", `Refused: ${err.message}`);
      case GuardedFetchErrorCode.REDIRECT_INVALID:
        // A redirect to a non-https URL lands here too.
        return new SafeFetchError("blocked", `Refused redirect: ${err.message}`);
      case GuardedFetchErrorCode.TOO_MANY_REDIRECTS:
        return new SafeFetchError("redirects", `More than ${MAX_REDIRECTS} redirects`);
      case GuardedFetchErrorCode.TIMEOUT:
        return new SafeFetchError("timeout", "The request timed out");
      case GuardedFetchErrorCode.RESPONSE_TOO_LARGE:
        return new SafeFetchError("too_large", err.message);
      default:
        return new SafeFetchError("network", `Network error: ${err.message}`);
    }
  }
  return new SafeFetchError("network", `Network error: ${err instanceof Error ? err.message : String(err)}`);
}

const PDF_TYPES = new Set(["application/pdf", "application/x-pdf", "application/octet-stream", "binary/octet-stream"]);

/**
 * A PDF (≤ `maxBytes`, default and hard cap 20 MB; `%PDF` magic bytes) as raw bytes. The caller
 * checks pages and budgets before handing it to the model.
 */
export async function fetchPdf(
  url: string,
  deps: FetchDeps & { maxBytes?: number } = {},
): Promise<{ data: Uint8Array; bytes: number }> {
  const { bytes } = await safeFetch(url, {
    ...deps,
    maxBytes: Math.min(deps.maxBytes ?? PDF_MAX_BYTES, PDF_MAX_BYTES),
    timeoutMs: 90_000,
    accept: (t) => PDF_TYPES.has(t),
    headers: { accept: "application/pdf" },
  });
  const magic = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (!magic.trimStart().startsWith("%PDF-")) throw new SafeFetchError("not_pdf", "The file is not a PDF");
  return { data: bytes, bytes: bytes.byteLength };
}

/** A PDF's size in bytes (Content-Length when sent, else counted while streaming; ≤ 20 MB). */
export async function fetchPdfSize(url: string, deps: FetchDeps = {}): Promise<number> {
  const { size } = await safeFetch(url, {
    ...deps,
    maxBytes: PDF_MAX_BYTES,
    timeoutMs: 60_000,
    accept: (t) => PDF_TYPES.has(t),
    headers: { accept: "application/pdf" },
    sizeOnly: true,
  });
  return size;
}

const TEXT_TYPES = /^(text\/[\w.+-]+|application\/(xhtml\+xml|xml|json|[\w.+-]+\+(xml|json)))$/;

/** A web page or text document (≤ 5 MB), decoded as UTF-8. `html` says whether to strip markup. */
export async function fetchText(
  url: string,
  deps: FetchDeps = {},
): Promise<{ text: string; contentType: string; html: boolean }> {
  const { bytes, contentType, charset } = await safeFetch(url, {
    ...deps,
    maxBytes: TEXT_MAX_BYTES,
    timeoutMs: 30_000,
    accept: (t) => TEXT_TYPES.test(t),
    headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1" },
  });
  const text = decode(bytes, charset);
  return { text, contentType, html: contentType === "text/html" || contentType === "application/xhtml+xml" };
}

/** Decodes with the response's charset (e.g. windows-1251 on older Russian sites), else UTF-8. */
function decode(bytes: Uint8Array, charset?: string): string {
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // unknown label
  }
}

/** A small JSON document (≤ 256 KB), e.g. YouTube oEmbed. */
export async function fetchJson(url: string, deps: FetchDeps = {}): Promise<unknown> {
  const { bytes } = await safeFetch(url, {
    ...deps,
    maxBytes: JSON_MAX_BYTES,
    timeoutMs: 15_000,
    accept: (t) => t === "application/json" || t.endsWith("+json") || t === "text/javascript" || t === "text/json",
    headers: { accept: "application/json" },
  });
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SafeFetchError("bad_type", "The response is not valid JSON");
  }
}
