// Pure parsers for ```youtube and ```resource fenced blocks. No React/DOM imports: the Convex
// source scanner (convex/lib/sourceScan.ts) imports this file by relative path.
import { z } from "zod";

const youtubeSchema = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/, "videoId must be an 11-character YouTube ID"),
  title: z.string().trim().min(1, "title is required"),
  start: z.number().int().min(0).optional(),
});

const resourceSchema = z.object({
  resourceId: z.string().trim().min(1, "resourceId is required"),
});

export type YoutubeEmbed = { videoId: string; title: string; start?: number };
export type ParsedYoutube = { ok: true; embed: YoutubeEmbed } | { ok: false; error: string };
export type ParsedResource = { ok: true; resourceId: string } | { ok: false; error: string };

function parseJson(json: string): { ok: true; raw: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, raw: JSON.parse(json) };
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` };
  }
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Parses the JSON body of a ```youtube block. Never throws. */
export function parseYoutubeBlock(json: string): ParsedYoutube {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const result = youtubeSchema.safeParse(parsed.raw);
  return result.success
    ? { ok: true, embed: result.data }
    : { ok: false, error: describeIssue(result.error) };
}

/** Parses the JSON body of a ```resource block. Never throws. */
export function parseResourceBlock(json: string): ParsedResource {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const result = resourceSchema.safeParse(parsed.raw);
  return result.success
    ? { ok: true, resourceId: result.data.resourceId }
    : { ok: false, error: describeIssue(result.error) };
}

/** True only for absolute http(s) URLs; rejects javascript:, data:, etc. */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
