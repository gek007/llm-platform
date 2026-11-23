import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Enrolls the user in the course if not already enrolled. */
export async function ensureEnrolled(
  ctx: Pick<MutationCtx, "db">,
  userId: string,
  courseId: Id<"courses">,
) {
  const enrolled = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .unique();
  if (!enrolled) {
    await ctx.db.insert("enrollments", { userId, courseId, enrolledAt: Date.now() });
  }
}
