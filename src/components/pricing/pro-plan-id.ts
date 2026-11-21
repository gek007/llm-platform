import { createClerkClient } from "@clerk/nextjs/server";
import { cacheLife } from "next/cache";
import { PRO_PLAN_SLUG } from "./pricing-config";

async function lookupProPlanId(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  // createClerkClient (not clerkClient()) because it doesn't read request headers, which "use cache" forbids.
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { data } = await client.billing.getPlanList({ payerType: "user", limit: 100 });
  return data.find((plan) => plan.slug === PRO_PLAN_SLUG)?.id ?? null;
}

/**
 * Resolves the Clerk Billing plan ID of the `pro` plan.
 * 1. `NEXT_PUBLIC_CLERK_PRO_PLAN_ID` wins when set.
 * 2. Otherwise the Clerk backend SDK lists user plans and the one with slug `pro` is used.
 * Returns `null` when neither works (the UI then shows a disabled button with a dev message).
 */
export async function getProPlanId(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_CLERK_PRO_PLAN_ID?.trim();
  if (fromEnv) return fromEnv;
  try {
    return await lookupProPlanId();
  } catch (error) {
    console.error("Could not look up the Clerk Pro plan", error);
    return null;
  }
}
