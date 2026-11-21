import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = Pick<QueryCtx | MutationCtx, "auth" | "db">;

/**
 * Custom claims on the Clerk session token (session token v2):
 *  - `metadata`: `{{user.public_metadata}}`, a custom claim set in the Clerk instance (`role: "admin"`).
 *  - `pla`: the active billing plan as `u:<slug>` (user) or `o:<slug>` (org), e.g. `u:pro`, `u:free_user`.
 *  - `fea`: comma-separated features, e.g. `u:feature_a,u:feature_b`.
 */
export const PRO_PLAN_SLUG = "pro";

export function claimsIsAdmin(identity: UserIdentity | null): boolean {
  const metadata = identity?.metadata as { role?: unknown } | undefined;
  return metadata?.role === "admin";
}

export function claimsIsPlan(identity: UserIdentity | null, slug: string): boolean {
  const pla = identity?.pla;
  return typeof pla === "string" && pla.split(",").some((p) => p === `u:${slug}`);
}

export async function getIdentity(ctx: Pick<Ctx, "auth">) {
  return await ctx.auth.getUserIdentity();
}

/** Throws unless signed in; returns the identity (`identity.subject` is the Clerk user ID). */
export async function requireUser(ctx: Pick<Ctx, "auth">) {
  const identity = await getIdentity(ctx);
  if (!identity) throw new ConvexError("UNAUTHENTICATED");
  return identity;
}

export async function isAdmin(ctx: Pick<Ctx, "auth">): Promise<boolean> {
  return claimsIsAdmin(await getIdentity(ctx));
}

export async function requireAdmin(ctx: Pick<Ctx, "auth">) {
  const identity = await requireUser(ctx);
  if (!claimsIsAdmin(identity)) throw new ConvexError("FORBIDDEN");
  return identity;
}

/**
 * True when the user is on the Pro plan. Reads the `pla` claim from the session token
 * (`u:pro`); falls back to `users.plan` (set by a billing webhook, if one is ever added).
 * Admins are not automatically Pro here; callers combine `isPro || isAdmin`.
 */
export async function isPro(ctx: Ctx): Promise<boolean> {
  const identity = await getIdentity(ctx);
  if (!identity) return false;
  if (claimsIsPlan(identity, PRO_PLAN_SLUG)) return true;
  return await userRecordIsPro(ctx, identity.subject);
}

/** `users.plan` fallback for the Pro check, by Clerk user ID. */
export async function userRecordIsPro(ctx: Pick<Ctx, "db">, subject: string): Promise<boolean> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", subject))
    .unique();
  return user?.plan === "pro";
}

export type ViewerState = {
  subject: string | null;
  signedIn: boolean;
  admin: boolean;
  pro: boolean;
};

/** One-stop viewer state for access checks. `pro` is the plan only (admin not folded in). */
export async function getViewerState(ctx: Ctx): Promise<ViewerState> {
  const identity = await getIdentity(ctx);
  if (!identity) return { subject: null, signedIn: false, admin: false, pro: false };
  return {
    subject: identity.subject,
    signedIn: true,
    admin: claimsIsAdmin(identity),
    pro: await isPro(ctx),
  };
}
