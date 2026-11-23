"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { MAX_CHAPTERS, MAX_SUBCHAPTERS, type Outline } from "../../../convex/lib/engineTypes";
import { StatusMessage } from "@/components/admin/admin-fields";
import { errorMessage } from "@/components/admin/admin-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeFailure, postAction } from "./api";

type Chapter = Outline["chapters"][number];
type Sub = Chapter["subchapters"][number];

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Edits the proposed outline. Field values are course-language content, hence `dir="auto"`. */
export function OutlineEditor({ jobId, outline, language }: { jobId: string; outline: Outline; language: string }) {
  const updateOutline = useMutation(api.generation.updateOutline);
  const [chapters, setChapters] = useState<Chapter[]>(outline.chapters);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const edit = (next: Chapter[]) => {
    setChapters(next);
    setDirty(true);
    setSaved(false);
  };
  const setChapter = (ci: number, patch: Partial<Chapter>) =>
    edit(chapters.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const setSub = (ci: number, si: number, patch: Partial<Sub>) =>
    setChapter(ci, { subchapters: chapters[ci].subchapters.map((s, i) => (i === si ? { ...s, ...patch } : s)) });

  const complete = chapters.every(
    (c) => c.title.trim() && c.goal.trim() && c.subchapters.every((s) => s.title.trim() && s.goal.trim()),
  );

  async function save(): Promise<boolean> {
    if (!complete) {
      setError("Every chapter and subchapter needs a title and a goal.");
      return false;
    }
    setBusy("save");
    setError(undefined);
    try {
      await updateOutline({
        jobId: jobId as never,
        outline: {
          chapters: chapters.map((c) => ({
            ...c,
            title: c.title.trim(),
            goal: c.goal.trim(),
            subchapters: c.subchapters.map((s) => ({ ...s, title: s.title.trim(), goal: s.goal.trim() })),
          })),
        },
      });
      setDirty(false);
      setSaved(true);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setError(undefined);
    if (dirty && !(await save())) return;
    setBusy("approve");
    const result = await postAction("approve", { jobId });
    if (!result.ok) setError(describeFailure(result));
    setBusy(null);
  }

  const disabled = busy !== null;

  return (
    <section aria-label="Outline editor" className="flex flex-col gap-4" lang={language} dir={language === "he" ? "rtl" : undefined}>
      <ol className="flex flex-col gap-4">
        {chapters.map((chapter, ci) => {
          const n = ci + 1;
          return (
            <li key={ci} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Chapter ${n} title`} dir="auto" value={chapter.title} onChange={(e) => setChapter(ci, { title: e.target.value })} className="min-w-48 flex-1" />
                <Button type="button" variant="ghost" aria-label={`Move chapter ${n} up`} disabled={disabled || ci === 0} onClick={() => edit(move(chapters, ci, ci - 1))}>↑</Button>
                <Button type="button" variant="ghost" aria-label={`Move chapter ${n} down`} disabled={disabled || ci === chapters.length - 1} onClick={() => edit(move(chapters, ci, ci + 1))}>↓</Button>
                <Button type="button" variant="ghost" aria-label={`Remove chapter ${n}`} disabled={disabled || chapters.length === 1} onClick={() => edit(chapters.filter((_, i) => i !== ci))}>Remove</Button>
              </div>
              <Input aria-label={`Chapter ${n} goal`} dir="auto" value={chapter.goal} onChange={(e) => setChapter(ci, { goal: e.target.value })} />
              <ol className="flex flex-col gap-3 ps-4">
                {chapter.subchapters.map((sub, si) => {
                  const sn = `${n}.${si + 1}`;
                  return (
                    <li key={si} className="flex flex-col gap-2 border-s-2 border-line ps-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label={`Subchapter ${sn} title`} dir="auto" value={sub.title} onChange={(e) => setSub(ci, si, { title: e.target.value })} className="min-w-48 flex-1" />
                        <Button type="button" variant="ghost" aria-label={`Move subchapter ${sn} up`} disabled={disabled || si === 0} onClick={() => setChapter(ci, { subchapters: move(chapter.subchapters, si, si - 1) })}>↑</Button>
                        <Button type="button" variant="ghost" aria-label={`Move subchapter ${sn} down`} disabled={disabled || si === chapter.subchapters.length - 1} onClick={() => setChapter(ci, { subchapters: move(chapter.subchapters, si, si + 1) })}>↓</Button>
                        <Button type="button" variant="ghost" aria-label={`Remove subchapter ${sn}`} disabled={disabled || chapter.subchapters.length === 1} onClick={() => setChapter(ci, { subchapters: chapter.subchapters.filter((_, i) => i !== si) })}>Remove</Button>
                      </div>
                      <Input aria-label={`Subchapter ${sn} goal`} dir="auto" value={sub.goal} onChange={(e) => setSub(ci, si, { goal: e.target.value })} />
                    </li>
                  );
                })}
              </ol>
              <Button type="button" variant="secondary" className="self-start" aria-label={`Add subchapter to chapter ${n}`} disabled={disabled || chapter.subchapters.length >= MAX_SUBCHAPTERS} onClick={() => setChapter(ci, { subchapters: [...chapter.subchapters, { title: "", goal: "" }] })}>
                Add subchapter
              </Button>
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="secondary" className="self-start" disabled={disabled || chapters.length >= MAX_CHAPTERS} onClick={() => edit([...chapters, { title: "", goal: "", subchapters: [{ title: "", goal: "" }] }])}>
        Add chapter
      </Button>
      {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      {saved && !error ? <StatusMessage kind="success">Outline saved.</StatusMessage> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" disabled={disabled || !dirty} onClick={() => void save()}>
          Save outline
        </Button>
        <Button type="button" disabled={disabled} onClick={() => void approve()}>
          Approve and write
        </Button>
      </div>
    </section>
  );
}
