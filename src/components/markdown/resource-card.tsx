"use client";

import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

const KIND_LABEL: Record<string, string> = { pdf: "PDF", url: "Link", youtube: "Video", text: "Text" };

/** Download (PDF) or link card for a course resource; the URL is resolved server-side per viewer. */
export function ResourceCard({ resourceId }: { resourceId: string }) {
  const resource = useQuery(api.resources.getForViewer, { resourceId });

  if (resource === undefined) {
    return (
      <div role="status" aria-busy="true" className="not-prose my-6 h-16 animate-pulse rounded-xl border border-line bg-surface-2" />
    );
  }
  if (resource === null) {
    return (
      <div role="status" className="not-prose my-6 rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
        This resource is not available.
      </div>
    );
  }
  const isPdf = resource.kind === "pdf";
  return (
    <div className="not-prose my-6 flex items-center gap-3 rounded-xl border border-line-strong bg-surface-2 p-4 shadow-soft">
      <span className="rounded bg-surface-3 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-accent">
        {KIND_LABEL[resource.kind] ?? resource.kind}
      </span>
      <span className="flex-1 font-medium">{resource.title}</span>
      <Button
        variant="secondary"
        aria-label={`${isPdf ? "Download" : "Open"} ${resource.title}`}
        render={
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer noopener"
            {...(isPdf ? { download: "" } : {})}
          />
        }
      >
        {isPdf ? "Download" : "Open"}
      </Button>
    </div>
  );
}
