"use client";

import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useAdminQuery } from "@/components/admin/use-admin-query";

export function JobsList() {
  const jobs = useAdminQuery(api.generation.list, {});
  if (jobs === undefined || jobs.length === 0) return null;
  return (
    <section aria-label="Generation jobs" className="flex flex-col gap-3">
      <h2 className="font-display text-xl">Generation jobs</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
        {jobs.map((job) => (
          <li key={job._id}>
            <Link href={`/admin/generate/${job._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="truncate font-medium text-fg" dir="auto">
                {job.topic}
              </span>
              <span className="shrink-0 capitalize text-muted">{job.status.replace("_", " ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
