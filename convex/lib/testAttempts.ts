import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * A viewer's attempts at one chapter test, across all versions (one testId per chapter).
 * `best` is the highest score; `passed` is true when any attempt passed.
 */
export async function attemptSummary(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userId: string,
  testId: Id<"chapterTests">,
) {
  const attempts = await ctx.db
    .query("testAttempts")
    .withIndex("by_user_test", (q) => q.eq("userId", userId).eq("testId", testId))
    .collect();
  const top = attempts.reduce<(typeof attempts)[number] | null>(
    (b, a) => (b === null || a.scorePercent > b.scorePercent ? a : b),
    null,
  );
  return {
    attemptsUsed: attempts.length,
    best: top ? { scorePercent: top.scorePercent, passed: attempts.some((a) => a.passed) } : null,
  };
}
