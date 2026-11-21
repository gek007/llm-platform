"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, isKebabCase, slugify } from "./admin-utils";
import { FormField, SelectField, StatusMessage, Textarea } from "./admin-fields";
import { StringListEditor } from "./string-list-editor";

type Course = Doc<"courses">;
type Errors = Partial<Record<"title" | "slug" | "summary" | "order", string>>;

const levels = ["beginner", "intermediate", "advanced"].map((v) => ({ value: v, label: v }));
const tiers = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
];
const statuses = ["draft", "published", "archived"].map((v) => ({ value: v, label: v }));

/** Create (no `course`) or edit a course. Creating navigates to the new course's editor. */
export function CourseForm({ course }: { course?: Course }) {
  const router = useRouter();
  const create = useMutation(api.admin.createCourse);
  const update = useMutation(api.admin.updateCourse);

  const [title, setTitle] = useState(course?.title ?? "");
  const [slug, setSlug] = useState(course?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(course));
  const [summary, setSummary] = useState(course?.summary ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [level, setLevel] = useState<Course["level"]>(course?.level ?? "beginner");
  const [tier, setTier] = useState<Course["tier"]>(course?.tier ?? "free");
  const [status, setStatus] = useState<Course["status"]>(course?.status ?? "draft");
  const [tags, setTags] = useState<string[]>(course?.tags ?? []);
  const [outcomes, setOutcomes] = useState<string[]>(course?.outcomes ?? []);
  const [coverImageUrl, setCoverImageUrl] = useState(course?.coverImageUrl ?? "");
  const [order, setOrder] = useState(course ? String(course.order) : "");
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!title.trim()) next.title = "Title is required.";
    if (!slug) next.slug = "Slug is required.";
    else if (!isKebabCase(slug)) next.slug = "Use kebab-case: lowercase letters, numbers and single hyphens.";
    if (!summary.trim()) next.summary = "Summary is required.";
    if (order.trim() && !Number.isFinite(Number(order))) next.order = "Order must be a number.";
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload = {
      slug,
      title: title.trim(),
      summary: summary.trim(),
      description,
      level,
      tier,
      status,
      tags,
      outcomes,
      coverImageUrl: coverImageUrl.trim() || undefined,
      order: order.trim() ? Number(order) : undefined,
    };
    setSaving(true);
    try {
      if (course) {
        await update({ courseId: course._id, ...payload });
        setFeedback({ kind: "success", text: "Course saved." });
      } else {
        const id = await create(payload);
        router.push(`/admin/courses/${id}`);
      }
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Course details">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Title" htmlFor="course-title" error={errors.title}>
          <Input
            id="course-title"
            value={title}
            onValueChange={(value) => {
              setTitle(value);
              if (!slugTouched) setSlug(slugify(value));
            }}
          />
        </FormField>
        <FormField label="Slug" htmlFor="course-slug" error={errors.slug} hint="Used in the course URL.">
          <Input
            id="course-slug"
            value={slug}
            onValueChange={(value) => {
              setSlugTouched(true);
              setSlug(value);
            }}
          />
        </FormField>
      </div>
      <FormField label="Summary" htmlFor="course-summary" error={errors.summary}>
        <Input id="course-summary" value={summary} onValueChange={setSummary} />
      </FormField>
      <FormField label="Description (markdown)" htmlFor="course-description">
        <Textarea
          id="course-description"
          rows={8}
          value={description}
          onValueChange={setDescription}
          className="font-mono"
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Level" htmlFor="course-level">
          <SelectField
            id="course-level"
            options={levels}
            value={level}
            onChange={(e) => setLevel(e.target.value as Course["level"])}
          />
        </FormField>
        <FormField label="Tier" htmlFor="course-tier">
          <SelectField
            id="course-tier"
            options={tiers}
            value={tier}
            onChange={(e) => setTier(e.target.value as Course["tier"])}
          />
        </FormField>
        <FormField label="Status" htmlFor="course-status">
          <SelectField
            id="course-status"
            options={statuses}
            value={status}
            onChange={(e) => setStatus(e.target.value as Course["status"])}
          />
        </FormField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <StringListEditor label="Tags" items={tags} onChange={setTags} placeholder="e.g. react" />
        <StringListEditor
          label="Outcomes"
          items={outcomes}
          onChange={setOutcomes}
          placeholder="What you'll learn"
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Cover image URL" htmlFor="course-cover">
          <Input id="course-cover" value={coverImageUrl} onValueChange={setCoverImageUrl} />
        </FormField>
        <FormField
          label="Catalog order"
          htmlFor="course-order"
          error={errors.order}
          hint="Lower numbers come first. Blank = last."
        >
          <Input id="course-order" inputMode="numeric" value={order} onValueChange={setOrder} />
        </FormField>
      </div>
      {feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : course ? "Save course" : "Create course"}
        </Button>
      </div>
    </form>
  );
}
