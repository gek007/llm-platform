/** Single source of truth for Pro pricing. Yearly is 10x monthly ("2 months free"). */
export const PRO_PRICING = {
  monthly: 19,
  yearly: 190,
  currency: "USD",
} as const;

export type BillingPeriod = "monthly" | "yearly";

/** Clerk's `planPeriod` values for each billing period. */
export const CLERK_PLAN_PERIOD = { monthly: "month", yearly: "annual" } as const;

/** Slug of the Pro plan in Clerk Billing. */
export const PRO_PLAN_SLUG = "pro";

export const monthsFree = 12 - PRO_PRICING.yearly / PRO_PRICING.monthly;

export function formatUsd(amount: number): string {
  return `$${amount}`;
}

export const freeFeatures = [
  "Every free course, in full",
  "Free preview lessons from Pro courses",
  "Progress tracking across all your courses",
  "Interactive quizzes and code samples",
];

export const proFeatures = [
  "Everything in Free",
  "Every Pro course, every lesson",
  "AI tutor that knows your place in the material",
  "Video lessons with full markdown, code and quizzes",
  "New courses as they are published",
];
