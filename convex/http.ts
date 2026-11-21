import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
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

export default http;
