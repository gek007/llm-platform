import { defineTool, toolOutput, toolOutputPart } from "eve/tools";
import { z } from "zod";
import type { ReadStatus } from "../../../../convex/lib/engineTypes";
import { engineFromEnv, type EngineClient } from "../lib/engine-client";
import { htmlTitle, htmlToText } from "../lib/html-text";
import { estimatePdfPages, PDF_INLINE_MAX_BYTES, PDF_JOB_MAX_BYTES, PDF_MODEL_MAX_PAGES } from "../lib/pdf";
import { fetchPdf, fetchPdfSize, fetchText, SafeFetchError, type FetchDeps } from "../lib/safe-fetch";
import { engineSafe } from "../lib/tool-result";
import { youtubeInfo } from "../lib/youtube";

const MAX_TEXT_CHARS = 60_000;
/** Resource title the platform gives a YouTube link added without one (convex/generation.ts). */
const DEFAULT_YOUTUBE_TITLE = "YouTube video";

type Job = Awaited<ReturnType<EngineClient["getJob"]>>;
type Resource = Job["resources"][number];

type Unreadable = { ok: true; resourceId: string; kind: Resource["kind"]; title: string; readStatus: "unreadable"; reason: string };
type Output =
  | { ok: false; message: string }
  | Unreadable
  | { ok: true; resourceId: string; kind: "url"; title: string; url: string; readStatus: "read"; pageTitle?: string; text: string; truncated: boolean }
  | { ok: true; resourceId: string; kind: "pdf"; title: string; readStatus: "read"; pages: number; bytes: number; base64: string }
  | { ok: true; resourceId: string; kind: "text"; title: string; readStatus: "read"; text: string }
  | { ok: true; resourceId: string; kind: "youtube"; title: string; url: string; readStatus: "embed_only"; videoId: string; channel: string };

function truncate(text: string) {
  return text.length > MAX_TEXT_CHARS
    ? { text: text.slice(0, MAX_TEXT_CHARS), truncated: true }
    : { text, truncated: false };
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/**
 * Bytes of the job's other PDFs already marked `read` (attached to the model in this job). Sizes
 * are probed again because Convex keeps no size; a PDF that can't be probed counts as the inline
 * maximum, so the budget errs on the safe side.
 */
async function attachedPdfBytes(job: Job, except: string, deps: FetchDeps): Promise<number> {
  const others = job.resources.filter((x) => x.kind === "pdf" && x.readStatus === "read" && x.id !== except);
  const sizes = await Promise.all(
    others.map((x) => (x.fileUrl ? fetchPdfSize(x.fileUrl, deps).catch(() => PDF_INLINE_MAX_BYTES) : 0)),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

export default defineTool({
  description:
    "Read one of the admin's resources and record its read status. Web page: its readable text (up to 60 000 characters). PDF: the document itself (up to 100 pages and 10 MB, 15 MB for all PDFs in a job). Pasted text: the text. YouTube: title and channel only (embed-only; you never see the video). A resource that can't be read is marked unreadable with the reason; continue without it.",
  inputSchema: z.object({
    jobId: z.string().min(1).describe("The jobId from the command."),
    resourceId: z.string().min(1).describe("A resource id from get_job."),
  }),
  label: { start: () => "Read a resource" },
  async execute({ jobId, resourceId }, ctx): Promise<Output> {
    return engineSafe(async (): Promise<Output> => {
      const engine = engineFromEnv();
      const job = await engine.getJob({ jobId });
      const r = job.resources.find((x) => x.id === resourceId);
      if (!r) {
        return {
          ok: false,
          message: `NOT_FOUND: resource ${resourceId} is not in job ${jobId}; use a resource id from get_job`,
        };
      }
      const base = { ok: true as const, resourceId, title: r.title };
      const mark = (readStatus: ReadStatus, title?: string) =>
        engine.setResourceStatus({ jobId, resourceId, readStatus, ...(title ? { title } : {}) });
      const unreadable = async (reason: string): Promise<Unreadable> => {
        await mark("unreadable");
        await engine.reportProgress({ jobId, kind: "source", message: `Could not read "${r.title}": ${reason}`.slice(0, 2000) });
        return { ...base, kind: r.kind, readStatus: "unreadable", reason };
      };
      const deps = { signal: ctx.abortSignal };

      switch (r.kind) {
        case "url": {
          if (!r.url) return unreadable("the resource has no URL");
          let page;
          try {
            page = await fetchText(r.url, deps);
          } catch (err) {
            return unreadable(message(err));
          }
          const pageTitle = page.html ? htmlTitle(page.text) : undefined;
          const body = truncate(page.html ? htmlToText(page.text) : page.text.trim());
          if (!body.text) return unreadable("the page has no readable text");
          await mark("read");
          return { ...base, kind: "url", url: r.url, readStatus: "read", pageTitle, ...body };
        }
        case "pdf": {
          if (!r.fileUrl) return unreadable("the PDF file is missing");
          // A PDF the model can't take would fail every later model call of the session (eve
          // stores and re-sends file parts), so check pages and size budgets before attaching.
          let pdf;
          try {
            pdf = await fetchPdf(r.fileUrl, { ...deps, maxBytes: PDF_INLINE_MAX_BYTES });
          } catch (err) {
            if (err instanceof SafeFetchError && err.code === "too_large") {
              return unreadable(`the PDF is larger than ${mb(PDF_INLINE_MAX_BYTES)}; the model reads PDFs up to ${mb(PDF_INLINE_MAX_BYTES)}`);
            }
            return unreadable(message(err));
          }
          const pages = estimatePdfPages(pdf.data);
          if (pages === null) return unreadable("could not count the PDF's pages (it may be encrypted, damaged or unusually complex)");
          if (pages > PDF_MODEL_MAX_PAGES) {
            return unreadable(`the PDF has ${pages} pages; the model accepts up to ${PDF_MODEL_MAX_PAGES}`);
          }
          const attached = await attachedPdfBytes(job, resourceId, deps);
          if (attached + pdf.bytes > PDF_JOB_MAX_BYTES) {
            return unreadable(
              `PDFs in this job would exceed ${mb(PDF_JOB_MAX_BYTES)} together (already read: ${mb(attached)}, this one: ${mb(pdf.bytes)})`,
            );
          }
          await mark("read");
          const base64 = Buffer.from(pdf.data.buffer, pdf.data.byteOffset, pdf.data.byteLength).toString("base64");
          return { ...base, kind: "pdf", readStatus: "read", pages, bytes: pdf.bytes, base64 };
        }
        case "text": {
          const text = r.text?.trim() ?? "";
          if (!text) return unreadable("the pasted text is empty");
          await mark("read");
          return { ...base, kind: "text", readStatus: "read", text };
        }
        case "youtube": {
          if (!r.url) return unreadable("the resource has no URL");
          let info;
          try {
            info = await youtubeInfo(r.url, deps);
          } catch (err) {
            return unreadable(message(err));
          }
          // Keep a title the admin typed; replace the platform's placeholder with the real one.
          const title = r.title === DEFAULT_YOUTUBE_TITLE ? info.title : undefined;
          await mark("embed_only", title);
          return {
            ...base,
            kind: "youtube",
            url: r.url,
            readStatus: "embed_only",
            videoId: info.videoId,
            title: info.title,
            channel: info.channel,
          };
        }
      }
    });
  },
  // The PDF goes to the model as a file part; everything else as JSON. (The full output, base64
  // included, is still recorded on the call's settled event.)
  toModelOutput(output) {
    if (output.ok && output.readStatus === "read" && output.kind === "pdf") {
      const { base64, ...meta } = output;
      return toolOutput.content([
        toolOutputPart.text(JSON.stringify(meta)),
        toolOutputPart.file(base64, { mediaType: "application/pdf", filename: "resource.pdf" }),
      ]);
    }
    return toolOutput.json(output);
  },
});
