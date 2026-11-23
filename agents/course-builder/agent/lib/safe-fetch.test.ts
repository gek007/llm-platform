// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { PDF_MAX_BYTES } from "../../../../convex/lib/engineTypes";
import { fetchJson, fetchPdf, fetchText, SafeFetchError, TEXT_MAX_BYTES } from "./safe-fetch";

// A public IPv4 literal: guarded-fetch skips DNS for IP literals, so these tests never touch the
// network. The injected `fetch` stands in for the connection.
const PUBLIC = "https://93.184.215.14";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");

function transport(handler: (url: string) => Response) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(SafeFetchError);
    return (err as SafeFetchError).code;
  }
  throw new Error("expected a SafeFetchError");
}

describe("safe fetch: destinations", () => {
  test("refuses http:// (https only) without connecting", async () => {
    const fetch = transport(() => new Response("hi"));
    expect(await codeOf(fetchText("http://example.com/", { fetch }))).toBe("blocked");
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    "https://127.0.0.1/",
    "https://127.1/",
    "https://2130706433/", // decimal 127.0.0.1
    "https://0x7f.0.0.1/", // hex
    "https://0177.0.0.1/", // octal
    "https://0.0.0.0/",
    "https://[::1]/",
    "https://[::]/",
    "https://[::ffff:127.0.0.1]/", // IPv4-mapped IPv6
    "https://[::ffff:a9fe:a9fe]/", // IPv4-mapped 169.254.169.254
    "https://[64:ff9b::a00:1]/", // NAT64 of 10.0.0.1
    "https://[2002:a00:1::]/", // 6to4 of 10.0.0.1
    "https://[fe80::1]/",
    "https://[fd00:ec2::254]/", // AWS IMDS over IPv6 (ULA)
    "https://10.0.0.1/",
    "https://172.16.5.4/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/", // cloud metadata
    "https://100.100.100.200/", // CGNAT (Alibaba metadata)
    "https://localhost/",
    "https://LOCALHOST./",
    "https://api.localhost/",
    "https://printer.local/",
  ])("refuses the private or local address %s without connecting", async (url) => {
    const fetch = transport(() => new Response("secret"));
    expect(await codeOf(fetchText(url, { fetch }))).toBe("blocked");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("refuses a redirect to a private address and never follows it", async () => {
    const fetch = transport((url) =>
      url.startsWith(PUBLIC)
        ? new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" } })
        : new Response("credentials"),
    );
    expect(await codeOf(fetchText(`${PUBLIC}/page`, { fetch }))).toBe("blocked");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("refuses a redirect to http://", async () => {
    const fetch = transport(() => new Response(null, { status: 301, headers: { location: "http://93.184.215.14/" } }));
    expect(await codeOf(fetchText(`${PUBLIC}/page`, { fetch }))).toBe("blocked");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("follows up to 3 redirects, then stops", async () => {
    let hop = 0;
    const loop = transport(() => new Response(null, { status: 302, headers: { location: `${PUBLIC}/hop${++hop}` } }));
    expect(await codeOf(fetchText(`${PUBLIC}/start`, { fetch: loop }))).toBe("redirects");
    expect(loop).toHaveBeenCalledTimes(4);

    let n = 0;
    const ok = transport(() =>
      ++n <= 3
        ? new Response(null, { status: 302, headers: { location: `${PUBLIC}/hop${n}` } })
        : new Response("<p>done</p>", { headers: { "content-type": "text/html" } }),
    );
    expect((await fetchText(`${PUBLIC}/start`, { fetch: ok })).text).toContain("done");
  });

  test("an HTTP error status is an error", async () => {
    const fetch = transport(() => new Response("nope", { status: 404 }));
    expect(await codeOf(fetchText(`${PUBLIC}/missing`, { fetch }))).toBe("http");
  });
});

describe("safe fetch: size, type and magic bytes", () => {
  test("aborts an oversized stream past the cap without reading the rest", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(1024 * 1024).fill(97);
    const fetch = transport(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls++;
              controller.enqueue(chunk);
            },
          }),
          { headers: { "content-type": "text/plain" } },
        ),
    );
    expect(await codeOf(fetchText(`${PUBLIC}/huge`, { fetch }))).toBe("too_large");
    expect(pulls).toBeLessThan(TEXT_MAX_BYTES / chunk.length + 4);
  });

  test("refuses a PDF whose Content-Length is over 20 MB before reading it", async () => {
    let pulled = false;
    const fetch = transport(
      () =>
        new Response(
          new ReadableStream({
            pull() {
              pulled = true;
            },
          }, { highWaterMark: 0 }), // pulls only when read
          { headers: { "content-type": "application/pdf", "content-length": String(PDF_MAX_BYTES + 1) } },
        ),
    );
    expect(await codeOf(fetchPdf(`${PUBLIC}/big.pdf`, { fetch }))).toBe("too_large");
    expect(pulled).toBe(false);
  });

  test("refuses a PDF without the %PDF magic bytes", async () => {
    const fetch = transport(
      () => new Response("<html>login page</html>", { headers: { "content-type": "application/pdf" } }),
    );
    expect(await codeOf(fetchPdf(`${PUBLIC}/fake.pdf`, { fetch }))).toBe("not_pdf");
  });

  test("refuses a PDF served with a non-PDF Content-Type", async () => {
    const fetch = transport(() => new Response(pdfBytes, { headers: { "content-type": "text/html" } }));
    expect(await codeOf(fetchPdf(`${PUBLIC}/doc.pdf`, { fetch }))).toBe("bad_type");
  });

  test("returns a real PDF as base64", async () => {
    const fetch = transport(() => new Response(pdfBytes, { headers: { "content-type": "application/pdf" } }));
    const pdf = await fetchPdf(`${PUBLIC}/doc.pdf`, { fetch });
    expect(pdf.bytes).toBe(pdfBytes.length);
    expect(Buffer.from(pdf.base64, "base64").toString("utf8")).toBe(new TextDecoder().decode(pdfBytes));
  });

  test("text accepts HTML and plain text, refuses binaries", async () => {
    const html = transport(() => new Response("<p>Hi</p>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(await fetchText(`${PUBLIC}/`, { fetch: html })).toMatchObject({ html: true, text: "<p>Hi</p>" });
    const bin = transport(() => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/png" } }));
    expect(await codeOf(fetchText(`${PUBLIC}/x.png`, { fetch: bin }))).toBe("bad_type");
  });

  test("text honours the response charset", async () => {
    const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет" in windows-1251
    const fetch = transport(() => new Response(cp1251, { headers: { "content-type": "text/plain; charset=windows-1251" } }));
    expect((await fetchText(`${PUBLIC}/ru`, { fetch })).text).toBe("Привет");
  });

  test("json parses a small JSON body", async () => {
    const fetch = transport(() => Response.json({ title: "T" }));
    expect(await fetchJson(`${PUBLIC}/oembed`, { fetch })).toEqual({ title: "T" });
  });

  test("an abort during a stalled body read stops the read", async () => {
    const fetch = transport(
      () =>
        new Response(
          new ReadableStream<Uint8Array>(
            {
              start(controller) {
                controller.enqueue(new TextEncoder().encode("partial"));
              }, // then never sends more
            },
            { highWaterMark: 0 },
          ),
          { headers: { "content-type": "text/plain" } },
        ),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    expect(await codeOf(fetchText(`${PUBLIC}/slow`, { fetch, signal: controller.signal }))).toBe("aborted");
  });

  test("an aborted signal stops the fetch", async () => {
    const fetch = transport(() => new Response("x", { headers: { "content-type": "text/plain" } }));
    const controller = new AbortController();
    controller.abort();
    expect(await codeOf(fetchText(`${PUBLIC}/`, { fetch, signal: controller.signal }))).toBe("aborted");
  });
});
