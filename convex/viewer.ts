import { query } from "./_generated/server";
import { getViewerState } from "./lib/auth";

/** `isPro` is the plan only; admins have `isAdmin` and can access everything regardless. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerState(ctx);
    const user = viewer.subject
      ? await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", viewer.subject!))
          .unique()
      : null;
    return {
      signedIn: viewer.signedIn,
      isAdmin: viewer.admin,
      isPro: viewer.pro,
      user,
    };
  },
});
