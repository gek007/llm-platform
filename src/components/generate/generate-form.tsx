"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LENGTH_PRESETS, type Language, type Length } from "../../../convex/lib/engineTypes";
import { FormField, SelectField, StatusMessage, Textarea } from "@/components/admin/admin-fields";
import { errorMessage } from "@/components/admin/admin-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postAction } from "./api";
import { ResourceInputs, type PendingResource } from "./resource-inputs";

const languages = [
  { value: "en", label: "English" },
  { value: "he", label: "עברית" },
  { value: "ru", label: "Русский" },
];
const levels = ["beginner", "intermediate", "advanced"].map((v) => ({ value: v, label: v }));
const lengths = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

function presetDescription(length: Length): string {
  const p = LENGTH_PRESETS[length];
  const subs = p.minSub === p.maxSub ? `${p.minSub}` : `${p.minSub}-${p.maxSub}`;
  return `${p.chapters} chapters, ${subs} subchapters each`;
}

export function GenerateForm() {
  const router = useRouter();
  const createJob = useMutation(api.generation.createJob);
  const generateUploadUrl = useMutation(api.generation.generateUploadUrl);
  const addResource = useMutation(api.generation.addResource);

  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [length, setLength] = useState<Length>("medium");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");
  const [resources, setResources] = useState<PendingResource[]>([]);
  const [topicError, setTopicError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const trimmed = topic.trim();
    if (trimmed.length < 3 || trimmed.length > 200) {
      setTopicError("Topic must be 3 to 200 characters.");
      return;
    }
    setTopicError(undefined);
    setBusy(true);
    try {
      const jobId = await createJob({ topic: trimmed, language, level, length, audience: audience.trim() || undefined, notes: notes.trim() || undefined });
      for (const resource of resources) {
        if (resource.kind === "pdf") {
          const uploadUrl = await generateUploadUrl({});
          const response = await fetch(uploadUrl, { method: "POST", headers: { "content-type": "application/pdf" }, body: resource.file });
          if (!response.ok) throw new Error("PDF upload failed. Try again.");
          const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
          await addResource({ jobId, kind: "pdf", storageId, title: resource.file.name });
        } else if (resource.kind === "text") {
          await addResource({ jobId, kind: "text", text: resource.text });
        } else {
          await addResource({ jobId, kind: resource.kind, url: resource.url });
        }
      }
      // 409/502 still mean the job exists; the live view shows its state and Resume.
      const started = await postAction("start", { jobId });
      if (!started.ok && started.status !== 409 && started.status !== 502) {
        setError(started.error);
        setBusy(false);
        return;
      }
      router.push(`/admin/generate/${jobId}`);
    } catch (e) {
      setError(e instanceof Error && !("data" in e) ? e.message : errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-5">
      <FormField label="Topic" htmlFor="gen-topic" hint="What should the course teach?" error={topicError}>
        <Input id="gen-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} dir="auto" />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Language" htmlFor="gen-language">
          <SelectField id="gen-language" value={language} onChange={(e) => setLanguage(e.target.value as Language)} options={languages} />
        </FormField>
        <FormField label="Level" htmlFor="gen-level">
          <SelectField id="gen-level" value={level} onChange={(e) => setLevel(e.target.value as typeof level)} options={levels} />
        </FormField>
        <FormField label="Length" htmlFor="gen-length" hint={presetDescription(length)}>
          <SelectField id="gen-length" value={length} onChange={(e) => setLength(e.target.value as Length)} options={lengths} />
        </FormField>
      </div>
      <FormField label="Audience" htmlFor="gen-audience" hint="Optional: who is this for?">
        <Input id="gen-audience" value={audience} onChange={(e) => setAudience(e.target.value)} dir="auto" />
      </FormField>
      <FormField label="Notes" htmlFor="gen-notes" hint="Optional: tone, must-cover topics, things to avoid.">
        <Textarea id="gen-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} dir="auto" />
      </FormField>
      <ResourceInputs resources={resources} onChange={setResources} disabled={busy} />
      {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Starting..." : "Generate"}
      </Button>
    </form>
  );
}
