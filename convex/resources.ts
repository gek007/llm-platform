import { v } from "convex/values";
import { query } from "./_generated/server";
import { canAccessCourseContent } from "./lib/access";
import { getViewerState } from "./lib/auth";

/**
 * Resolves a course resource for the viewer: `{ title, kind, url }`, or null when it does not
 * exist, its course is a draft (non-admins), it has no course yet (non-admins), the course content
 * is locked for the viewer, or it has no linkable URL (`text` resources are source material for the
 * engine and are never exposed). PDFs resolve through `ctx.storage.getUrl`.
 */
export const getForViewer = query({
  args: { resourceId: v.string() },
  handler: async (ctx, { resourceId }) => {
    const id = ctx.db.normalizeId("courseResources", resourceId);
    if (!id) return null;
    const resource = await ctx.db.get(id);
    if (!resource) return null;
    const viewer = await getViewerState(ctx);

    if (!resource.courseId) {
      if (!viewer.admin) return null;
    } else {
      const course = await ctx.db.get(resource.courseId);
      if (!course) return null;
      if (course.status !== "published" && !viewer.admin) return null;
      if (!canAccessCourseContent({ course, ...viewer })) return null;
    }

    let url: string | null = null;
    if (resource.kind === "pdf") {
      url = resource.storageId ? await ctx.storage.getUrl(resource.storageId) : null;
    } else if (resource.kind === "url" || resource.kind === "youtube") {
      url = resource.url ?? null;
    }
    if (!url) return null;
    return { title: resource.title, kind: resource.kind, url };
  },
});
