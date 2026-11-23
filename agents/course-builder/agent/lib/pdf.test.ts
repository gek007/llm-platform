// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { estimatePdfPages, PDF_SCAN_LIMITS, scanPdfPages } from "./pdf";

const bytes = (...parts: (string | Uint8Array)[]) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));

/** One FlateDecode object stream wrapping `content`. */
function objStm(n: number, content: Buffer) {
  const z = deflateSync(content);
  return bytes(`${n} 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${z.length} >>\nstream\n`, z, "\nendstream\nendobj\n");
}
const pageObjects = (k: number) => Buffer.from("<< /Type /Page /Parent 1 0 R >> ".repeat(k));
const bomb = Buffer.alloc(64 * 1024); // inflates to 64 KB, over the small test caps

describe("estimatePdfPages", () => {
  test("counts /Type /Page objects but not /Pages", () => {
    const pdf = bytes(
      "%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 /Kids [2 0 R 3 0 R] >> endobj\n",
      "2 0 obj <</Type/Page/Parent 1 0 R>> endobj\n3 0 obj << /Parent 1 0 R /Type /Page >> endobj\n%%EOF",
    );
    expect(estimatePdfPages(pdf)).toBe(2);
  });

  test("counts pages inside compressed object streams (PDF 1.5+)", () => {
    const objects = deflateSync(
      Buffer.from("2 0 3 30 << /Type /Page /Parent 1 0 R >> << /Type /Page /Parent 1 0 R >> << /Type /Pages /Count 2 >>"),
    );
    const pdf = bytes(
      "%PDF-1.7\n5 0 obj << /Type /ObjStm /N 3 /First 8 /Filter /FlateDecode /Length ",
      String(objects.length),
      " >>\nstream\r\n",
      objects,
      "\r\nendstream\nendobj\n%%EOF",
    );
    expect(estimatePdfPages(pdf)).toBe(2);
  });

  test("returns null when no page object is found (encrypted or damaged)", () => {
    expect(estimatePdfPages(bytes("%PDF-1.4\n%%EOF"))).toBeNull();
  });

  test("many zip-bomb streams stop at the total inflate budget (attempted work is charged)", () => {
    const limits = { perStreamBytes: 4096, totalBytes: 16 * 1024, maxStreams: 1000 };
    const pdf = bytes("%PDF-1.7\n", ...Array.from({ length: 50 }, (_, i) => objStm(i + 10, bomb)), "%%EOF");
    const scan = scanPdfPages(pdf, limits);
    expect(scan.streamsTried).toBe(4); // 4 × 4 KB charged = the 16 KB budget, then stop
    expect(scan.inflateBytesCharged).toBe(limits.totalBytes);
    expect(scan.complete).toBe(false);
    expect(estimatePdfPages(pdf, limits)).toBeNull(); // unknown page count → unreadable
  });

  test("the last stream gets only the budget that remains", () => {
    const limits = { perStreamBytes: 4096, totalBytes: 6000, maxStreams: 1000 };
    const pdf = bytes("%PDF-1.7\n", objStm(10, bomb), objStm(11, bomb), objStm(12, bomb), "%%EOF");
    const scan = scanPdfPages(pdf, limits);
    expect(scan.streamsTried).toBe(2); // 4096 + 1904
    expect(scan.inflateBytesCharged).toBe(6000);
  });

  test("the object-stream count cap is honoured", () => {
    const limits = { ...PDF_SCAN_LIMITS, maxStreams: 3 };
    const pdf = bytes("%PDF-1.7\n", ...Array.from({ length: 10 }, (_, i) => objStm(i + 10, pageObjects(1))), "%%EOF");
    const scan = scanPdfPages(pdf, limits);
    expect(scan).toMatchObject({ streamsTried: 3, pages: 3, complete: false });
    expect(estimatePdfPages(pdf, limits)).toBeNull();
    // Already over the page limit when the cap hits: still a definite "too many pages".
    const big = bytes("%PDF-1.7\n", ...Array.from({ length: 10 }, (_, i) => objStm(i + 10, pageObjects(60))), "%%EOF");
    expect(estimatePdfPages(big, limits)).toBe(180);
  });

  test("normal PDFs with many object streams are counted fully within the default limits", () => {
    const pdf = bytes("%PDF-1.7\n", ...Array.from({ length: 40 }, (_, i) => objStm(i + 10, pageObjects(2))), "%%EOF");
    expect(scanPdfPages(pdf)).toMatchObject({ pages: 80, streamsTried: 40, complete: true });
    expect(estimatePdfPages(pdf)).toBe(80);
  });
});
