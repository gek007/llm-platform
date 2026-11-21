import { ConvexHttpClient } from "convex/browser";
import type { ToolContext } from "eve/tools";
import { TOKEN_ATTRIBUTE, TOKEN_EXP_ATTRIBUTE } from "./clerk-auth";

export type ViewerClient =
  | { ok: true; client: ConvexHttpClient; userId: string }
  | { ok: false; message: string };

function attr(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Builds a Convex client that acts as the verified caller of this turn: the Clerk token the channel
 * verified is forwarded with `setAuth`, so Convex enforces access. The user ID comes only from the
 * verified session auth, never from tool input.
 */
export function viewerClient(ctx: ToolContext, now: () => number = Date.now): ViewerClient {
  const auth = ctx.session.auth.current;
  const token = attr(auth?.attributes?.[TOKEN_ATTRIBUTE]);
  if (!auth || auth.principalType !== "user" || !token) {
    return { ok: false, message: "No signed-in learner is attached to this conversation." };
  }
  const exp = Number(attr(auth.attributes[TOKEN_EXP_ATTRIBUTE]));
  if (!Number.isFinite(exp) || exp * 1000 <= now()) {
    return { ok: false, message: "The learner's session token expired. Ask them to send their message again." };
  }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) return { ok: false, message: "Course data is not configured." };
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return { ok: true, client, userId: auth.principalId };
}
