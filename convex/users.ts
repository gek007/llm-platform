import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Upserts the current user. Optional args let the client pass profile fields from Clerk's
 * `useUser()`, because the default session token carries no name/email/picture.
 * Fields that aren't provided keep their stored value.
 */
export const store = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireUser(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const email = args.email ?? identity.email ?? existing?.email;
    const imageUrl = args.imageUrl ?? identity.pictureUrl ?? existing?.imageUrl;
    const name =
      args.name?.trim() || identity.name || existing?.name || email || "Learner";

    if (existing) {
      if (
        existing.name !== name ||
        existing.email !== email ||
        existing.imageUrl !== imageUrl
      ) {
        await ctx.db.patch(existing._id, { name, email, imageUrl });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", { clerkId: identity.subject, name, email, imageUrl });
  },
});
