"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "./admin-utils";
import { FormField, StatusMessage, Textarea } from "./admin-fields";
import { DeckEditor } from "./deck-editor";
import { RegenerateDialog } from "./regenerate-dialog";
import { TestEditor } from "./test-editor";
import { useAdminQuery } from "./use-admin-query";

export type ChapterRow = {
  _id: Id<"chapters">;
  title: string;
  summary: string;
  order: number;
  lessons: { _id: Id<"lessons">; title: string; order: number }[];
  hasDeck: boolean;
  test: { _id: Id<"chapterTests">; version: number; questionCount: number; passPercent: number; maxAttempts: number } | null;
};

export function ChaptersPanel({
  courseId,
  chapters,
  language,
  jobId,
}: {
  courseId: Id<"courses">;
  chapters: ChapterRow[];
  language: string;
  jobId?: string;
}) {
  const job = useAdminQuery(api.generation.get, (jobId ? { jobId: jobId as Id<"generationJobs"> } : "skip") as never) as
    | Doc<"generationJobs">
    | null
    | undefined;
  const events = useAdminQuery(api.generation.events, (jobId ? { jobId: jobId as Id<"generationJobs"> } : "skip") as never) as
    | Doc<"generationEvents">[]
    | undefined;
  const regenerating = Boolean(jobId) && job?.status === "writing";
  const latest = events?.at(-1)?.message;

  return (
    <div className="flex flex-col gap-6" lang={language} dir={language === "he" ? "rtl" : undefined}>
      {regenerating ? (
        <p role="status" className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          Regenerating…{latest ? ` ${latest}` : ""}
        </p>
      ) : null}
      <ol className="flex flex-col gap-6">
        {chapters.map((chapter) => (
          <ChapterCard key={chapter._id} courseId={courseId} chapter={chapter} language={language} jobId={jobId} busy={regenerating} />
        ))}
      </ol>
    </div>
  );
}

function ChapterCard({
  courseId,
  chapter,
  language,
  jobId,
  busy,
}: {
  courseId: Id<"courses">;
  chapter: ChapterRow;
  language: string;
  jobId?: string;
  busy: boolean;
}) {
  const updateChapter = useMutation(api.admin.updateChapter);
  const [title, setTitle] = useState(chapter.title);
  const [summary, setSummary] = useState(chapter.summary);
  const [open, setOpen] = useState<"deck" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const n = chapter.order;

  async function save() {
    try {
      await updateChapter({ chapterId: chapter._id, title, summary });
      setFeedback({ kind: "success", text: "Chapter saved." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorMessage(e) });
    }
  }
  const toggle = (which: "deck" | "test") => setOpen(open === which ? null : which);

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-3">
        <FormField label={`Chapter ${n} title`} htmlFor={`chapter-${chapter._id}-title`}>
          <Input id={`chapter-${chapter._id}-title`} dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={`Chapter ${n} summary`} htmlFor={`chapter-${chapter._id}-summary`}>
          <Textarea id={`chapter-${chapter._id}-summary`} dir="auto" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" aria-label={`Save chapter ${n}`} onClick={() => void save()}>
            Save chapter
          </Button>
          {jobId ? (
            <RegenerateDialog jobId={jobId} target={{ kind: "chapter", chapterOrder: n }} label={`Regenerate chapter ${n}`} disabled={busy} />
          ) : null}
        </div>
        {feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">Lessons</h3>
        <ul className="flex flex-col gap-1">
          {chapter.lessons.map((lesson, i) => (
            <li key={lesson._id} className="flex items-center justify-between gap-2">
              <Link href={`/admin/courses/${courseId}/lessons/${lesson._id}`} dir="auto" className="text-accent hover:underline">
                {lesson.title}
              </Link>
              {jobId ? (
                <RegenerateDialog
                  jobId={jobId}
                  target={{ kind: "subchapter", chapterOrder: n, subchapterOrder: i + 1 }}
                  label={`Regenerate lesson ${lesson.title}`}
                  disabled={busy}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" aria-expanded={open === "deck"} onClick={() => toggle("deck")}>
          {open === "deck" ? "Hide deck" : chapter.hasDeck ? "Edit deck" : "Create deck"}
        </Button>
        {jobId ? <RegenerateDialog jobId={jobId} target={{ kind: "deck", chapterOrder: n }} label={`Regenerate deck of chapter ${n}`} disabled={busy} /> : null}
        <Button type="button" variant="secondary" aria-expanded={open === "test"} disabled={!chapter.test} onClick={() => toggle("test")}>
          {open === "test" ? "Hide test" : chapter.test ? `Edit test (${chapter.test.questionCount} questions)` : "No test"}
        </Button>
        {jobId && chapter.test ? (
          <RegenerateDialog jobId={jobId} target={{ kind: "test", chapterOrder: n }} label={`Regenerate test of chapter ${n}`} disabled={busy} />
        ) : null}
      </div>
      {open === "deck" ? <DeckEditor chapterId={chapter._id} language={language} /> : null}
      {open === "test" ? <TestEditor chapterId={chapter._id} language={language} /> : null}
    </li>
  );
}
