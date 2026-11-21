import { z } from "zod";

/** What the widget tells the agent about where the learner is. A hint only: tools still enforce access. */
export type PageContext = {
  pathname: string;
  courseSlug?: string;
  lessonSlug?: string;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** Parses `/courses/[slug]` and `/courses/[slug]/lessons/[lessonSlug]`; ignores anything else. */
export function parsePathname(pathname: string): PageContext {
  const clean = pathname.split(/[?#]/)[0].slice(0, 300) || "/";
  const match = clean.match(/^\/courses\/([^/]+)(?:\/lessons\/([^/]+))?\/?$/);
  const context: PageContext = { pathname: clean };
  if (match) {
    if (SLUG.test(match[1])) context.courseSlug = match[1];
    if (context.courseSlug && match[2] && SLUG.test(match[2])) context.lessonSlug = match[2];
  }
  return context;
}

const clientContextSchema = z.object({ pathname: z.string().max(300) }).passthrough();

/**
 * Server side: reads the raw `clientContext` of a request and re-derives the slugs from the
 * pathname, so a client cannot send inconsistent or malformed values. Returns null if unusable.
 */
export function readPageContext(raw: unknown): PageContext | null {
  const parsed = clientContextSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsePathname(parsed.data.pathname);
}

/** Model-facing description of the (unverified) page context. */
export function describePageContext(context: PageContext | null): string {
  if (!context) return "Page context: unknown (the learner's page was not reported).";
  const parts = [`The learner is on page ${context.pathname}.`];
  if (context.courseSlug) parts.push(`Course slug: ${context.courseSlug}.`);
  if (context.lessonSlug) parts.push(`Lesson slug: ${context.lessonSlug}.`);
  parts.push(
    "This is an unverified hint from the browser; use tools for facts and never assume access to locked content.",
  );
  return parts.join(" ");
}
