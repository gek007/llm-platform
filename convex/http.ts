import { httpRouter, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { checkEngineSecret } from "./lib/engineAuth";
import { mapMuxEvent, verifyMuxSignature } from "./muxData";

const http = httpRouter();

/**
 * Mux webhook. Not admin-authenticated (Mux calls it); trust comes from the `mux-signature`
 * header, verified with `MUX_WEBHOOK_SECRET` (HMAC + timestamp tolerance, else 401). Fails closed:
 * with no secret it returns 503 unless the dev-only `MUX_WEBHOOK_ALLOW_UNSIGNED=1` flag is set
 * (never set that on a real deployment). Local dev relies on `syncLessonVideo` polling instead.
 */
export const muxWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (secret) {
    const ok = await verifyMuxSignature(body, request.headers.get("mux-signature"), secret);
    if (!ok) return new Response("invalid signature", { status: 401 });
  } else if (process.env.MUX_WEBHOOK_ALLOW_UNSIGNED !== "1") {
    return new Response("webhook not configured", { status: 503 });
  }
  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const mapped = mapMuxEvent(event);
  if (mapped) {
    await ctx.runMutation(internal.muxData.applyEvent, {
      uploadId: mapped.match.uploadId,
      assetId: mapped.match.assetId,
      ...mapped.patch,
    });
  }
  return new Response(null, { status: 200 });
});

http.route({ path: "/mux/webhook", method: "POST", handler: muxWebhook });

type EngineOp =
  | { kind: "query"; ref: FunctionReference<"query", "internal"> }
  | { kind: "mutation"; ref: FunctionReference<"mutation", "internal"> };

const ENGINE_OPS = new Map<string, EngineOp>([
  ["getJob", { kind: "query", ref: internal.engine.getJob }],
  ["setResourceStatus", { kind: "mutation", ref: internal.engine.setResourceStatus }],
  ["saveSources", { kind: "mutation", ref: internal.engine.saveSources }],
  ["saveOutline", { kind: "mutation", ref: internal.engine.saveOutline }],
  ["reportProgress", { kind: "mutation", ref: internal.engine.reportProgress }],
  ["saveSubchapter", { kind: "mutation", ref: internal.engine.saveSubchapter }],
  ["saveDeck", { kind: "mutation", ref: internal.engine.saveDeck }],
  ["saveTest", { kind: "mutation", ref: internal.engine.saveTest }],
  ["finishJob", { kind: "mutation", ref: internal.engine.finishJob }],
  ["failJob", { kind: "mutation", ref: internal.engine.failJob }],
]);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Convex argument-validation failures (the request body did not match an op's validator).
const ARG_ERROR = /ArgumentValidationError|Value does not match validator|Validator error/;

/**
 * Course engine API: `POST /engine/<op>` with `Authorization: Bearer <COURSE_ENGINE_SECRET>` and a
 * JSON object body, dispatched to the internal functions in engine.ts (see there for ops and
 * state rules). 401 bad/missing secret (checked first, constant-time; also when the deployment has
 * no secret), 404 unknown op, 400 `{ ok: false, error }` for bad JSON, argument validation and
 * `ConvexError`s, 200 `{ ok: true, ...result }`. Anything else is 500 "Internal error"; stack
 * traces never leave the deployment.
 */
export const engineApi = httpAction(async (ctx, request) => {
  if (!checkEngineSecret(request.headers.get("authorization"), process.env.COURSE_ENGINE_SECRET)) {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }
  const opName = new URL(request.url).pathname.slice("/engine/".length);
  const op = ENGINE_OPS.get(opName);
  if (!op) return json(404, { ok: false, error: `Unknown op: ${opName.slice(0, 64)}` });

  let args: unknown;
  try {
    args = JSON.parse(await request.text());
  } catch {
    return json(400, { ok: false, error: "INVALID: body must be JSON" });
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return json(400, { ok: false, error: "INVALID: body must be a JSON object" });
  }

  try {
    const result =
      op.kind === "query"
        ? await ctx.runQuery(op.ref, args as Record<string, never>)
        : await ctx.runMutation(op.ref, args as Record<string, never>);
    return json(200, { ok: true, ...(result as Record<string, unknown> | null) });
  } catch (err) {
    if (err instanceof ConvexError) {
      return json(400, { ok: false, error: typeof err.data === "string" ? err.data : "INVALID" });
    }
    const message = err instanceof Error ? err.message : "";
    if (ARG_ERROR.test(message)) {
      // First lines only: the validator's path/value description, never a stack trace.
      const detail = message
        .split("\n")
        .filter((line) => line.trim() && !/^\s+at /.test(line))
        .slice(0, 4)
        .join(" ")
        .slice(0, 500);
      return json(400, { ok: false, error: `INVALID: ${detail}` });
    }
    console.error(`engine ${opName} failed`, err);
    return json(500, { ok: false, error: "Internal error" });
  }
});

http.route({ pathPrefix: "/engine/", method: "POST", handler: engineApi });

export default http;
