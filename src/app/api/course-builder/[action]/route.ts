import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { REGENERATE_PUBLISHED_MESSAGE } from "../../../../../convex/generation";
import { toCommand, type EngineCommand } from "@/lib/course-builder/commands";
import { dispatch } from "@/lib/course-builder/dispatch";

/**
 * `POST /api/course-builder/<start|approve|regenerate|resume>` with `{ jobId, ...}`. Admin only.
 * Each action makes its Convex transition (as the caller, with their Clerk token) and then
 * dispatches exactly one command to the engine, so a double click gets one transition and one
 * dispatch: the second call hits BAD_STATE and answers 409 with the job's current status.
 * Fake mode (`COURSE_ENGINE_MODE=fake`) runs the canned phase inside this request.
 */

const ACTIONS = new Set(["start", "approve", "regenerate", "resume"]);

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

type JobId = Id<"generationJobs">;

function errorCode(err: unknown): string | null {
  return err instanceof ConvexError && typeof err.data === "string"
    ? err.data
    : null;
}

function commandFor(
  action: string,
  body: Record<string, unknown>,
  jobId: string,
): EngineCommand | null {
  if (action === "start") return { action: "research", jobId };
  if (action === "approve") return { action: "write", jobId };
  if (action === "regenerate")
    return toCommand({ ...body, action: "regenerate", jobId });
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const { userId, sessionClaims, getToken } = await auth();
  const role = (sessionClaims as { metadata?: { role?: unknown } } | null)
    ?.metadata?.role;
  if (!userId || role !== "admin") return json(403, { error: "FORBIDDEN" });
  if (!ACTIONS.has(action)) return json(400, { error: "Unknown action" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  const fields =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!fields || typeof fields.jobId !== "string" || fields.jobId === "") {
    return json(400, { error: "jobId is required" });
  }
  const jobId = fields.jobId;
  const id = jobId as JobId;
  let cmd = commandFor(action, fields, jobId);
  if (action !== "resume" && !cmd)
    return json(400, { error: "Invalid regenerate target or instruction" });

  const token = await getToken();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !url) return json(403, { error: "FORBIDDEN" });
  const convex = new ConvexHttpClient(url);
  convex.setAuth(token);

  const current = async () =>
    (await convex.query(api.generation.get, { jobId: id })) as {
      status: string;
      courseId?: string;
      eveSessionId?: string;
    } | null;

  let sessionId: string | undefined;
  try {
    if (action === "start") {
      await convex.mutation(api.generation.startJob, { jobId: id });
    } else if (action === "approve" || action === "regenerate") {
      if (action === "approve")
        await convex.mutation(api.generation.approveOutline, { jobId: id });
      else
        await convex.mutation(api.generation.requestRegenerate, { jobId: id });
      // Follow-ups go to the job's session; without one (or if it's gone) the agent gets a new one.
      sessionId = (await current().catch(() => null))?.eveSessionId;
    } else {
      const job = await current();
      if (!job) return json(404, { error: "NOT_FOUND" });
      sessionId = job.eveSessionId;
      if (job.status === "researching") cmd = { action: "research", jobId };
      else if (job.status === "writing") cmd = { action: "write", jobId };
      else if (job.status === "failed")
        cmd = { action: job.courseId ? "write" : "research", jobId };
      else return json(409, { error: "BAD_STATE", status: job.status });
    }
  } catch (err) {
    const code = errorCode(err);
    if (code === "BAD_STATE") {
      const job = await current().catch(() => null);
      const published = action === "regenerate" && job?.status === "ready";
      return json(409, {
        error: published ? REGENERATE_PUBLISHED_MESSAGE : "BAD_STATE",
        status: job?.status ?? null,
      });
    }
    if (code === "FORBIDDEN" || code === "UNAUTHENTICATED")
      return json(403, { error: "FORBIDDEN" });
    if (code === "NOT_FOUND") return json(404, { error: "NOT_FOUND" });
    if (
      code?.startsWith("INVALID") ||
      (err instanceof Error &&
        /ArgumentValidation|Invalid ID|does not match validator/i.test(
          err.message,
        ))
    ) {
      return json(400, { error: code ?? "Invalid job id" });
    }
    console.error(`course-builder ${action} failed`, err);
    return json(500, { error: "Internal error" });
  }

  try {
    const result = await dispatch(cmd!, { sessionId });
    await convex.mutation(api.generation.markDispatched, {
      jobId: id,
      eveSessionId: result.sessionId,
    });
    return json(200, { ok: true, sessionId: result.sessionId });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(
      0,
      1000,
    );
    await convex
      .mutation(api.generation.markDispatchError, { jobId: id, error: message })
      .catch(() => {});
    return json(502, { error: message });
  }
}
