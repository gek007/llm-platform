// @vitest-environment node
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PDF_MAX_BYTES, type JobBrief } from "../../../../convex/lib/engineTypes";
import { EngineError, type EngineClient } from "../lib/engine-client";

// Fake engine: every op is a spy; tests set what getJob returns or make an op fail.
const engine = {
  getJob: vi.fn(),
  setResourceStatus: vi.fn(async () => {}),
  saveSources: vi.fn(async () => ({ sources: [{ id: "src1", url: "https://example.org/a" }] })),
  saveOutline: vi.fn(async () => {}),
  reportProgress: vi.fn(async () => {}),
};
vi.mock("../lib/engine-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/engine-client")>()),
  engineFromEnv: () => engine as unknown as EngineClient,
}));

// Mocked network: page and PDF fetches run the real safe fetch (caps, types, magic bytes) over this
// transport; public IP literals keep guarded-fetch from resolving DNS. oEmbed JSON is mocked whole.
let transport: (url: string) => Response = () => new Response("unset", { status: 500 });
const fetchJsonMock = vi.fn();
vi.mock("../lib/safe-fetch", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/safe-fetch")>();
  const fetch = (async (input: string | URL | Request) =>
    transport(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)) as typeof globalThis.fetch;
  return {
    ...real,
    fetchText: (url: string, deps: object = {}) => real.fetchText(url, { ...deps, fetch }),
    fetchPdf: (url: string, deps: object = {}) => real.fetchPdf(url, { ...deps, fetch }),
    fetchPdfSize: (url: string, deps: object = {}) => real.fetchPdfSize(url, { ...deps, fetch }),
    fetchJson: (url: string, deps: object = {}) => fetchJsonMock(url, deps),
  };
});

import getJob from "./get_job";
import readResource from "./read_resource";
import reportProgress from "./report_progress";
import saveOutline from "./save_outline";
import saveSources from "./save_sources";
import youtubeInfo from "./youtube_info";

const ctx = { abortSignal: new AbortController().signal } as unknown as ToolContext;
/* eslint-disable @typescript-eslint/no-explicit-any */
const run = async (tool: { execute: (i: never, c: ToolContext) => unknown }, input: unknown) =>
  (await tool.execute(input as never, ctx)) as Record<string, any>;

const PUBLIC = "https://93.184.215.14";

function job(over: Partial<JobBrief> = {}): JobBrief {
  return {
    jobId: "job1",
    status: "researching",
    topic: "Basics of personal budgeting",
    language: "en",
    level: "beginner",
    length: "short",
    resources: [],
    sources: [],
    ...over,
  };
}
const resource = (r: Partial<JobBrief["resources"][number]> & { id: string; kind: JobBrief["resources"][number]["kind"] }) => ({
  title: "Resource",
  readStatus: "pending" as const,
  ...r,
});

/** A minimal PDF-looking file with `pages` page objects, padded to `size` bytes. */
function pdfWithPages(pages: number, size = 0): Uint8Array<ArrayBuffer> {
  const head = `%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n` +
    Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj\n`).join("");
  const bytes = new Uint8Array(Math.max(size, head.length + 6));
  bytes.set(new TextEncoder().encode(head));
  bytes.set(new TextEncoder().encode("%%EOF\n"), bytes.length - 6);
  return bytes;
}
const MB = 1024 * 1024;
const pdfResponse = (body: Uint8Array<ArrayBuffer>) => new Response(body, { headers: { "content-type": "application/pdf" } });

function outline(chapters: number, subchapters: number) {
  return {
    chapters: Array.from({ length: chapters }, (_, c) => ({
      title: `Chapter ${c + 1}`,
      goal: `Goal ${c + 1}`,
      subchapters: Array.from({ length: subchapters }, (_, s) => ({ title: `Sub ${c + 1}.${s + 1}`, goal: "Learn it" })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transport = () => new Response("unset", { status: 500 });
});

describe("read_resource", () => {
  test("a PDF over the cap is marked unreadable with a reason", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r1", kind: "pdf", title: "Budget guide", fileUrl: `${PUBLIC}/api/storage/abc` })] }),
    );
    transport = () =>
      new Response(new ReadableStream(), {
        headers: { "content-type": "application/pdf", "content-length": String(PDF_MAX_BYTES + 1) },
      });
    const out = await run(readResource, { jobId: "job1", resourceId: "r1" });
    expect(out).toMatchObject({ ok: true, readStatus: "unreadable" });
    expect(out.reason).toMatch(/larger than 10 MB/);
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r1", readStatus: "unreadable" });
    expect(engine.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job1", kind: "source", message: expect.stringMatching(/Budget guide.*10 MB/) }),
    );
  });

  test("a readable PDF is marked read and reaches the model as a PDF file part", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r1", kind: "pdf", title: "Budget guide", fileUrl: `${PUBLIC}/api/storage/abc` })] }),
    );
    const pdf = pdfWithPages(3);
    transport = () => new Response(pdf, { headers: { "content-type": "application/pdf" } });
    const out = await run(readResource, { jobId: "job1", resourceId: "r1" });
    expect(out).toMatchObject({ ok: true, kind: "pdf", readStatus: "read" });
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r1", readStatus: "read" });
    const model = readResource.toModelOutput!(out as never) as any;
    expect(model.type).toBe("content");
    const file = model.value.find((p: any) => p.mediaType === "application/pdf");
    expect(file).toBeTruthy();
    expect(JSON.stringify(model)).toContain(out.base64);
  });

  test("a PDF over the model's page limit is marked unreadable and not attached", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r1", kind: "pdf", title: "Annual report", fileUrl: `${PUBLIC}/api/storage/abc` })] }),
    );
    transport = () => pdfResponse(pdfWithPages(120));
    const out = await run(readResource, { jobId: "job1", resourceId: "r1" });
    expect(out).toMatchObject({ ok: true, readStatus: "unreadable", reason: "the PDF has 120 pages; the model accepts up to 100" });
    expect(out.base64).toBeUndefined();
    const model = readResource.toModelOutput!(out as never) as any;
    expect(model.type).toBe("json");
    expect(JSON.stringify(model)).not.toContain("application/pdf");
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r1", readStatus: "unreadable" });
  });

  test("a second PDF that would exceed the job's PDF budget is marked unreadable", async () => {
    engine.getJob.mockResolvedValue(
      job({
        resources: [
          resource({ id: "r1", kind: "pdf", title: "First", fileUrl: `${PUBLIC}/api/storage/one`, readStatus: "read" }),
          resource({ id: "r2", kind: "pdf", title: "Second", fileUrl: `${PUBLIC}/api/storage/two` }),
        ],
      }),
    );
    const first = pdfWithPages(10, 9 * MB);
    const second = pdfWithPages(10, 7 * MB);
    transport = (url) => pdfResponse(url.endsWith("/one") ? first : second);
    const out = await run(readResource, { jobId: "job1", resourceId: "r2" });
    expect(out).toMatchObject({ ok: true, readStatus: "unreadable" });
    expect(out.reason).toBe("PDFs in this job would exceed 15 MB together (already read: 9 MB, this one: 7 MB)");
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r2", readStatus: "unreadable" });
  });

  test("a small second PDF within the job budget is still attached and marked read", async () => {
    engine.getJob.mockResolvedValue(
      job({
        resources: [
          resource({ id: "r1", kind: "pdf", title: "First", fileUrl: `${PUBLIC}/api/storage/one`, readStatus: "read" }),
          resource({ id: "r2", kind: "pdf", title: "Second", fileUrl: `${PUBLIC}/api/storage/two` }),
        ],
      }),
    );
    const first = pdfWithPages(10, 9 * MB);
    const second = pdfWithPages(4, 1 * MB);
    transport = (url) => pdfResponse(url.endsWith("/one") ? first : second);
    const out = await run(readResource, { jobId: "job1", resourceId: "r2" });
    expect(out).toMatchObject({ ok: true, kind: "pdf", readStatus: "read", pages: 4, bytes: MB });
    const model = readResource.toModelOutput!(out as never) as any;
    expect(model.value.some((p: any) => p.mediaType === "application/pdf")).toBe(true);
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r2", readStatus: "read" });
  });

  test("a YouTube resource is marked embed_only with its oEmbed title and channel", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r2", kind: "youtube", title: "YouTube video", url: "https://youtu.be/dQw4w9WgXcQ" })] }),
    );
    fetchJsonMock.mockResolvedValue({ title: "Budgeting 101", author_name: "Money Channel" });
    const out = await run(readResource, { jobId: "job1", resourceId: "r2" });
    expect(out).toMatchObject({
      ok: true,
      kind: "youtube",
      readStatus: "embed_only",
      videoId: "dQw4w9WgXcQ",
      title: "Budgeting 101",
      channel: "Money Channel",
    });
    expect(fetchJsonMock.mock.calls[0][0]).toBe(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json",
    );
    expect(engine.setResourceStatus).toHaveBeenCalledWith({
      jobId: "job1",
      resourceId: "r2",
      readStatus: "embed_only",
      title: "Budgeting 101",
    });
  });

  test("an admin-titled YouTube resource keeps its title", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r2", kind: "youtube", title: "Intro video", url: "https://youtu.be/dQw4w9WgXcQ" })] }),
    );
    fetchJsonMock.mockResolvedValue({ title: "Budgeting 101", author_name: "Money Channel" });
    await run(readResource, { jobId: "job1", resourceId: "r2" });
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r2", readStatus: "embed_only" });
  });

  test("a web page is read as readable text, truncated to 60 000 characters, and marked read", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r3", kind: "url", title: "example.org", url: `${PUBLIC}/budget` })] }),
    );
    const body = "word ".repeat(20_000);
    transport = () =>
      new Response(
        `<html><head><title>Budget &amp; you</title><style>p{}</style><script>alert(1)</script></head><body><h1>Budgets</h1><p>${body}</p></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    const out = await run(readResource, { jobId: "job1", resourceId: "r3" });
    expect(out).toMatchObject({ ok: true, kind: "url", readStatus: "read", pageTitle: "Budget & you", truncated: true });
    expect(out.text.length).toBe(60_000);
    expect(out.text).toContain("Budgets");
    expect(out.text).not.toMatch(/alert|<p>|p\{\}/);
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r3", readStatus: "read" });
  });

  test("a web page that fails to load is marked unreadable", async () => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r3", kind: "url", title: "Local", url: "https://127.0.0.1/admin" })] }),
    );
    const out = await run(readResource, { jobId: "job1", resourceId: "r3" });
    expect(out).toMatchObject({ ok: true, readStatus: "unreadable" });
    expect(engine.setResourceStatus).toHaveBeenCalledWith({ jobId: "job1", resourceId: "r3", readStatus: "unreadable" });
  });

  test("pasted text is returned as is and marked read", async () => {
    engine.getJob.mockResolvedValue(job({ resources: [resource({ id: "r4", kind: "text", text: "Pay yourself first." })] }));
    const out = await run(readResource, { jobId: "job1", resourceId: "r4" });
    expect(out).toMatchObject({ ok: true, kind: "text", readStatus: "read", text: "Pay yourself first." });
  });

  test("an unknown resource is { ok: false }", async () => {
    engine.getJob.mockResolvedValue(job());
    expect(await run(readResource, { jobId: "job1", resourceId: "nope" })).toMatchObject({ ok: false });
  });
});

describe("save_sources refuses admin file storage URLs", () => {
  test.each([
    ["the exact fileUrl", `${PUBLIC}/api/storage/abc`],
    ["another URL on the storage host", `${PUBLIC}/api/storage/other`],
    ["a Convex storage path on another deployment", "https://happy-otter-123.convex.cloud/api/storage/0b1c"],
  ])("%s", async (_label, url) => {
    engine.getJob.mockResolvedValue(
      job({ resources: [resource({ id: "r1", kind: "pdf", title: "Budget guide", fileUrl: `${PUBLIC}/api/storage/abc` })] }),
    );
    const out = await run(saveSources, {
      jobId: "job1",
      sources: [
        { url: "https://example.org/a", title: "A", kind: "web" },
        { url, title: "Budget guide", kind: "pdf", resourceId: "r1" },
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/^INVALID: .*private storage URL.*resourceIds/);
    expect(engine.saveSources).not.toHaveBeenCalled();
  });
});

describe("youtube_info", () => {
  test("returns the video ID, title and channel", async () => {
    fetchJsonMock.mockResolvedValue({ title: "Budgeting 101", author_name: "Money Channel" });
    expect(await run(youtubeInfo, { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10" })).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      title: "Budgeting 101",
      channel: "Money Channel",
    });
  });

  test("a non-YouTube URL is { ok: false } without fetching", async () => {
    expect(await run(youtubeInfo, { url: "https://example.org/video" })).toMatchObject({ ok: false });
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });
});

describe("save_outline", () => {
  test("rejects 6 chapters for a short course before calling the engine", async () => {
    engine.getJob.mockResolvedValue(job({ length: "short" }));
    const out = await run(saveOutline, { jobId: "job1", outline: outline(6, 2) });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/short.*3 chapters/);
    expect(engine.saveOutline).not.toHaveBeenCalled();
  });

  test("rejects too many subchapters for the preset", async () => {
    engine.getJob.mockResolvedValue(job({ length: "medium" }));
    const out = await run(saveOutline, { jobId: "job1", outline: outline(5, 4) });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/medium course has exactly 5 chapters with 3 subchapters each; chapter 1 has 4 subchapters/);
    expect(engine.saveOutline).not.toHaveBeenCalled();
  });

  test("saves an outline that fits the preset", async () => {
    engine.getJob.mockResolvedValue(job({ length: "short" }));
    const o = outline(3, 2);
    expect(await run(saveOutline, { jobId: "job1", outline: o })).toEqual({ ok: true, chapters: 3 });
    expect(engine.saveOutline).toHaveBeenCalledWith({ jobId: "job1", outline: o });
  });

  test("an engine error surfaces as { ok: false } with the engine's message", async () => {
    engine.getJob.mockResolvedValue(job({ length: "short" }));
    engine.saveOutline.mockRejectedValueOnce(new EngineError("Unknown reference: resource:zzz"));
    expect(await run(saveOutline, { jobId: "job1", outline: outline(3, 3) })).toEqual({
      ok: false,
      message: "Unknown reference: resource:zzz",
    });
  });
});

describe("engine errors surface as { ok: false }", () => {
  test("get_job", async () => {
    engine.getJob.mockRejectedValueOnce(new EngineError("NOT_FOUND: job job9"));
    expect(await run(getJob, { jobId: "job9" })).toEqual({ ok: false, message: "NOT_FOUND: job job9" });
  });

  test("read_resource", async () => {
    engine.getJob.mockRejectedValueOnce(new EngineError("NOT_FOUND: job job9"));
    expect(await run(readResource, { jobId: "job9", resourceId: "r1" })).toEqual({
      ok: false,
      message: "NOT_FOUND: job job9",
    });
  });

  test("save_sources", async () => {
    engine.getJob.mockResolvedValue(job());
    engine.saveSources.mockRejectedValueOnce(new EngineError("INVALID: source url must be an absolute http(s) URL: x"));
    const out = await run(saveSources, { jobId: "job1", sources: [{ url: "x", title: "X", kind: "web" }] });
    expect(out).toEqual({ ok: false, message: "INVALID: source url must be an absolute http(s) URL: x" });
  });

  test("report_progress", async () => {
    engine.reportProgress.mockRejectedValueOnce(new EngineError("BAD_STATE: job is outline_ready"));
    expect(await run(reportProgress, { jobId: "job1", kind: "info", message: "hi" })).toEqual({
      ok: false,
      message: "BAD_STATE: job is outline_ready",
    });
  });
});

describe("happy paths", () => {
  test("get_job returns the brief", async () => {
    engine.getJob.mockResolvedValue(job());
    expect(await run(getJob, { jobId: "job1" })).toEqual({ ok: true, job: job() });
  });

  test("save_sources returns the saved source IDs", async () => {
    engine.getJob.mockResolvedValue(job());
    const sources = [{ url: "https://example.org/a", title: "A", kind: "web" }];
    expect(await run(saveSources, { jobId: "job1", sources })).toEqual({
      ok: true,
      sources: [{ id: "src1", url: "https://example.org/a" }],
    });
    expect(engine.saveSources).toHaveBeenCalledWith({ jobId: "job1", sources });
  });

  test("report_progress logs an event", async () => {
    expect(await run(reportProgress, { jobId: "job1", kind: "outline", message: "Outline saved" })).toEqual({ ok: true });
    expect(engine.reportProgress).toHaveBeenCalledWith({ jobId: "job1", kind: "outline", message: "Outline saved" });
  });
});
