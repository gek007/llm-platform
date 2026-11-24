"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HAND_EDIT } from "../../../convex/lib/handEditLimits";
import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import { Slide } from "@/components/chapter/slide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "./admin-utils";
import { FormField, SelectField, StatusMessage, Textarea } from "./admin-fields";
import { SyncNotices } from "./sync-notices";
import { useAdminQuery } from "./use-admin-query";
import { useServerSync } from "./use-server-sync";

type Layout = SlideData["layout"];
const layouts: { value: Layout; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "bullets", label: "Bullets" },
  { value: "two-column", label: "Two columns" },
  { value: "quote", label: "Quote" },
  { value: "summary", label: "Summary" },
];

const lines = (items: string[] | undefined) => (items ?? []).join("\n");
const toList = (text: string) => text.split("\n");
const cleanList = (items: string[] | undefined) => (items ?? []).map((s) => s.trim()).filter(Boolean);

/** Keeps only the fields the layout uses, so switching layouts never leaves stale content behind. */
function cleanSlide(slide: SlideData): SlideData {
  const base = {
    ...(slide.id ? { id: slide.id } : {}),
    layout: slide.layout,
    title: slide.title.trim(),
    notes: slide.notes.trim(),
  };
  const visual = slide.visual ? { visual: slide.visual } : {};
  switch (slide.layout) {
    case "title":
      return { ...base, bullets: cleanList(slide.bullets).slice(0, 1) };
    case "bullets":
    case "summary":
      return { ...base, bullets: cleanList(slide.bullets) };
    case "bullets+visual":
      return { ...base, bullets: cleanList(slide.bullets), ...visual };
    case "visual-full":
      return { ...base, ...visual };
    case "code": {
      const bullets = cleanList(slide.bullets);
      return {
        ...base,
        ...(slide.code ? { code: { language: slide.code.language.trim(), content: slide.code.content } } : {}),
        ...(bullets.length > 0 ? { bullets } : {}),
      };
    }
    case "two-column":
      return { ...base, left: cleanList(slide.left), right: cleanList(slide.right) };
    case "quote":
      return {
        ...base,
        quote: (slide.quote ?? "").trim(),
        ...(slide.attribution?.trim() ? { attribution: slide.attribution.trim() } : {}),
      };
  }
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function DeckEditor({ chapterId, language, paused }: { chapterId: Id<"chapters">; language: string; paused?: boolean }) {
  const deck = useAdminQuery(api.admin.getDeck, { chapterId });
  if (deck === undefined) return <p className="text-muted">Loading deck...</p>;
  return (
    <DeckForm
      key={deck?._id ?? "none"}
      chapterId={chapterId}
      language={language}
      paused={paused}
      server={(deck?.slides as SlideData[] | undefined) ?? []}
    />
  );
}

function DeckForm({ chapterId, language, server, paused }: { chapterId: Id<"chapters">; language: string; server: SlideData[]; paused?: boolean }) {
  const updateDeck = useMutation(api.admin.updateDeck);
  const sync = useServerSync<SlideData[]>(server);
  const slides = sync.value;
  const setSlides = sync.setValue;
  const [selected, setSelected] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const index = Math.min(selected, Math.max(slides.length - 1, 0));
  const current = slides[index] as SlideData | undefined;
  const { minSlides, maxSlides } = HAND_EDIT;

  function edit(next: SlideData[], nextSelected = index) {
    setSlides(next);
    setSelected(nextSelected);
    setFeedback(null);
  }
  const patch = (changes: Partial<SlideData>) =>
    edit(slides.map((s, i) => (i === index ? { ...s, ...changes } : s)));

  async function save() {
    if (paused || sync.conflict) return;
    if (slides.length < minSlides || slides.length > maxSlides) {
      setFeedback({ kind: "error", text: `A deck needs ${minSlides} to ${maxSlides} slides; it has ${slides.length}.` });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const cleaned = slides.map(cleanSlide);
      await updateDeck({ chapterId, slides: cleaned });
      sync.markSaved(cleaned);
      setFeedback({ kind: "success", text: "Deck saved." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Slide deck editor" className="flex flex-col gap-4" lang={language} dir={language === "he" ? "rtl" : undefined}>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ol className="flex flex-col gap-1" aria-label="Slides">
          {slides.map((slide, i) => (
            <li key={i} className={`flex items-center gap-1 rounded-lg border p-1 ${i === index ? "border-accent" : "border-line"}`}>
              <Button
                type="button"
                variant="ghost"
                className="min-w-0 flex-1 justify-start truncate"
                aria-label={`Select slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setSelected(i)}
              >
                <span dir="auto" className="truncate">
                  {i + 1}. {slide.title || "(untitled)"}
                </span>
              </Button>
              <Button type="button" variant="ghost" aria-label={`Move slide ${i + 1} up`} disabled={i === 0} onClick={() => edit(move(slides, i, i - 1), i === index ? i - 1 : index)}>
                ↑
              </Button>
              <Button type="button" variant="ghost" aria-label={`Move slide ${i + 1} down`} disabled={i === slides.length - 1} onClick={() => edit(move(slides, i, i + 1), i === index ? i + 1 : index)}>
                ↓
              </Button>
              <Button type="button" variant="ghost" className="text-danger" aria-label={`Delete slide ${i + 1}`} onClick={() => edit(slides.filter((_, j) => j !== i), Math.max(0, i < index ? index - 1 : index))}>
                ✕
              </Button>
            </li>
          ))}
          <li>
            <Button type="button" variant="secondary" disabled={slides.length >= maxSlides} onClick={() => edit([...slides, { layout: "bullets", title: "New slide", bullets: ["Point"], notes: "Notes" }], slides.length)}>
              Add slide
            </Button>
          </li>
        </ol>

        {current ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Layout" htmlFor="slide-layout">
                <SelectField id="slide-layout" options={layouts} value={current.layout} onChange={(e) => patch({ layout: e.target.value as Layout })} />
              </FormField>
              <FormField label="Title" htmlFor="slide-title">
                <Input id="slide-title" dir="auto" value={current.title} onChange={(e) => patch({ title: e.target.value })} />
              </FormField>
            </div>
            {current.layout === "title" ? (
              <FormField label="Subtitle" htmlFor="slide-subtitle">
                <Input id="slide-subtitle" dir="auto" value={current.bullets?.[0] ?? ""} onChange={(e) => patch({ bullets: [e.target.value] })} />
              </FormField>
            ) : null}
            {current.layout === "bullets" || current.layout === "summary" ? (
              <FormField label="Bullets (one per line)" htmlFor="slide-bullets">
                <Textarea id="slide-bullets" dir="auto" rows={5} value={lines(current.bullets)} onChange={(e) => patch({ bullets: toList(e.target.value) })} />
              </FormField>
            ) : null}
            {current.layout === "two-column" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Left column (one per line)" htmlFor="slide-left">
                  <Textarea id="slide-left" dir="auto" rows={5} value={lines(current.left)} onChange={(e) => patch({ left: toList(e.target.value) })} />
                </FormField>
                <FormField label="Right column (one per line)" htmlFor="slide-right">
                  <Textarea id="slide-right" dir="auto" rows={5} value={lines(current.right)} onChange={(e) => patch({ right: toList(e.target.value) })} />
                </FormField>
              </div>
            ) : null}
            {current.layout === "quote" ? (
              <>
                <FormField label="Quote" htmlFor="slide-quote">
                  <Textarea id="slide-quote" dir="auto" rows={3} value={current.quote ?? ""} onChange={(e) => patch({ quote: e.target.value })} />
                </FormField>
                <FormField label="Attribution" htmlFor="slide-attribution">
                  <Input id="slide-attribution" dir="auto" value={current.attribution ?? ""} onChange={(e) => patch({ attribution: e.target.value })} />
                </FormField>
              </>
            ) : null}
            <FormField label="Speaker notes" htmlFor="slide-notes">
              <Textarea id="slide-notes" dir="auto" rows={3} value={current.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </FormField>
            <div aria-label="Slide preview" lang={language} dir={language === "he" ? "rtl" : undefined}>
              <Slide slide={cleanSlide(current)} />
            </div>
          </div>
        ) : (
          <p className="text-muted">This deck has no slides yet. Add one.</p>
        )}
      </div>
      <SyncNotices paused={paused} conflict={sync.conflict} onDiscard={sync.discard} />
      {feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null}
      <div>
        <Button type="button" disabled={saving || paused || sync.conflict} onClick={() => void save()}>
          Save deck
        </Button>
      </div>
    </section>
  );
}
