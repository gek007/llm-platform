"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, insertQuizBlock, isKebabCase, slugify } from "./admin-utils";
import { FormField, StatusMessage, SwitchField, Textarea } from "./admin-fields";

type Errors = Partial<Record<"title" | "slug" | "summary" | "duration", string>>;

export function LessonForm({ lesson }: { lesson: Doc<"lessons"> }) {
  const update = useMutation(api.admin.updateLesson);
  const [title, setTitle] = useState(lesson.title);
  const [slug, setSlug] = useState(lesson.slug);
  const [slugTouched, setSlugTouched] = useState(true);
  const [summary, setSummary] = useState(lesson.summary);
  const [body, setBody] = useState(lesson.body);
  const [duration, setDuration] = useState(String(lesson.durationMinutes));
  const [isFreePreview, setIsFreePreview] = useState(lesson.isFreePreview);
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!title.trim()) next.title = "Title is required.";
    if (!slug) next.slug = "Slug is required.";
    else if (!isKebabCase(slug)) next.slug = "Use kebab-case: lowercase letters, numbers and single hyphens.";
    if (!summary.trim()) next.summary = "Summary is required.";
    const minutes = Number(duration);
    if (!duration.trim() || !Number.isFinite(minutes) || minutes < 0) {
      next.duration = "Enter the duration in minutes (0 or more).";
    }
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await update({
        lessonId: lesson._id,
        slug,
        title: title.trim(),
        summary: summary.trim(),
        body,
        durationMinutes: Number(duration),
        isFreePreview,
      });
      setFeedback({ kind: "success", text: "Lesson saved." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Lesson details">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Title" htmlFor="lesson-title" error={errors.title}>
          <Input
            id="lesson-title"
            value={title}
            onValueChange={(value) => {
              setTitle(value);
              if (!slugTouched) setSlug(slugify(value));
            }}
          />
        </FormField>
        <FormField label="Slug" htmlFor="lesson-slug" error={errors.slug} hint="Unique within the course.">
          <Input
            id="lesson-slug"
            value={slug}
            onValueChange={(value) => {
              setSlugTouched(true);
              setSlug(value);
            }}
          />
        </FormField>
      </div>
      <FormField label="Summary" htmlFor="lesson-summary" error={errors.summary}>
        <Input id="lesson-summary" value={summary} onValueChange={setSummary} />
      </FormField>
      <div className="grid items-end gap-5 sm:grid-cols-2">
        <FormField label="Duration (minutes)" htmlFor="lesson-duration" error={errors.duration}>
          <Input id="lesson-duration" inputMode="numeric" value={duration} onValueChange={setDuration} />
        </FormField>
        <SwitchField
          label="Free preview"
          checked={isFreePreview}
          onCheckedChange={setIsFreePreview}
          hint="Anyone can view this lesson, even in a Pro course."
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="lesson-body" className="text-sm font-medium text-fg">
            Body (markdown)
          </label>
          <Button type="button" variant="secondary" onClick={() => setBody((b) => insertQuizBlock(b))}>
            Insert quiz block
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Textarea
            id="lesson-body"
            rows={22}
            value={body}
            onValueChange={setBody}
            className="min-h-96 font-mono"
          />
          <div
            aria-label="Preview"
            className="max-h-[36rem] min-h-96 overflow-auto rounded-lg border border-line bg-surface p-5"
          >
            {body.trim() ? <LessonMarkdown source={body} /> : <p className="text-sm text-subtle">Nothing to preview yet.</p>}
          </div>
        </div>
      </div>
      {feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save lesson"}
        </Button>
      </div>
    </form>
  );
}
