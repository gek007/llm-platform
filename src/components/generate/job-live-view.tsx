"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { StatusMessage } from "@/components/admin/admin-fields";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { describeFailure, postAction } from "./api";
import { OutlineEditor } from "./outline-editor";

const STEPS = [
  { label: "Research", statuses: ["queued", "researching"] },
  { label: "Outline", statuses: ["outline_ready"] },
  { label: "Writing", statuses: ["writing"] },
  { label: "Ready", statuses: ["ready"] },
];

function currentStep(status: string, hasOutline: boolean): number {
  const index = STEPS.findIndex((s) => s.statuses.includes(status));
  if (index >= 0) return index;
  return hasOutline ? 2 : 0; // failed: show where it stopped
}

export function JobLiveView({ jobId }: { jobId: string }) {
  const id = jobId as Id<"generationJobs">;
  const job = useAdminQuery(api.generation.get, { jobId: id });
  const events = useAdminQuery(api.generation.events, { jobId: id });
  const sources = useAdminQuery(api.generation.sources, { jobId: id });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  if (job === undefined) return <p className="text-muted">Loading job...</p>;
  if (job === null) return <StatusMessage kind="error">This job no longer exists.</StatusMessage>;

  async function run(action: "start" | "resume") {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    const result = await postAction(action, { jobId });
    if (!result.ok) setMessage(describeFailure(result));
    setBusy(false);
  }

  const step = currentStep(job.status, Boolean(job.outline));
  const chapterEvents = (order: number) => (events ?? []).filter((e) => e.chapterOrder === order).at(-1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl" dir="auto">
          {job.topic}
        </h1>
        <p className="text-sm text-muted">
          Status: <span className="font-medium capitalize text-fg">{job.status.replace("_", " ")}</span>
        </p>
      </div>

      <ol aria-label="Progress" className="flex flex-wrap gap-3 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s.label}
            aria-current={i === step && job.status !== "failed" ? "step" : undefined}
            className={`rounded-full border px-3 py-1 ${i === step ? "border-accent text-fg" : i < step ? "border-line text-muted" : "border-line text-subtle"}`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {job.dispatchError ? (
        <StatusMessage kind="error">The engine could not be reached: {job.dispatchError}</StatusMessage>
      ) : null}
      {job.status === "failed" ? <StatusMessage kind="error">{job.error ?? "The job failed."}</StatusMessage> : null}
      {message ? <StatusMessage kind="error">{message}</StatusMessage> : null}

      <div className="flex flex-wrap gap-3">
        {job.status === "queued" ? (
          <Button disabled={busy} onClick={() => void run("start")}>
            Start
          </Button>
        ) : null}
        {job.dispatchError ? (
          <Button disabled={busy} onClick={() => void run("resume")}>
            Resume
          </Button>
        ) : null}
        {job.status === "failed" ? (
          <Button variant={job.dispatchError ? "secondary" : "primary"} disabled={busy} onClick={() => void run("resume")}>
            Retry phase
          </Button>
        ) : null}
        {job.status === "ready" && job.courseId ? (
          <Button render={<Link href={`/admin/courses/${job.courseId}`} />}>Open draft course</Button>
        ) : null}
      </div>

      {job.status === "queued" ? <p className="text-muted">Waiting to start (queued).</p> : null}

      {job.status === "outline_ready" && job.outline ? (
        <OutlineEditor jobId={jobId} outline={job.outline} language={job.language} />
      ) : null}

      {job.status === "writing" && job.outline ? (
        <section aria-label="Chapters" className="grid gap-3 sm:grid-cols-2">
          {job.outline.chapters.map((chapter, i) => {
            const latest = chapterEvents(i + 1);
            return (
              <article key={i} className="rounded-xl border border-line bg-surface p-4">
                <h2 className="text-sm font-semibold" dir="auto">
                  Chapter {i + 1}: {chapter.title}
                </h2>
                <p className="mt-1 text-xs text-muted">{latest ? latest.message : "Waiting"}</p>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Activity">
          <h2 className="mb-2 text-sm font-semibold text-fg">Activity</h2>
          {events === undefined || events.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {events.map((e) => (
                <li key={e._id} className={e.kind === "error" ? "text-danger" : "text-muted"}>
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Sources">
          <h2 className="mb-2 text-sm font-semibold text-fg">Sources</h2>
          {sources === undefined || sources.length === 0 ? (
            <p className="text-sm text-muted">No sources yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {sources.map((s) => (
                <li key={s._id}>
                  <a className="text-accent underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
