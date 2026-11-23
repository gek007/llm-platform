// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { estimatePdfPages } from "./pdf";

const bytes = (...parts: (string | Uint8Array)[]) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));

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
});
