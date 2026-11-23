"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/admin/admin-fields";
import { isSafeHttpUrl, youtubeIdFromUrl } from "@/components/markdown/embeds";
import { PDF_MAX_BYTES } from "../../../convex/lib/engineTypes";

export type PendingResource =
  | { id: string; kind: "url" | "youtube"; url: string }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "pdf"; file: File };

let counter = 0;
const nextId = () => `r${++counter}`;

function label(resource: PendingResource): string {
  if (resource.kind === "pdf") return `PDF: ${resource.file.name}`;
  if (resource.kind === "text") return `Text: ${resource.text.slice(0, 60)}`;
  return `${resource.kind === "url" ? "URL" : "YouTube"}: ${resource.url}`;
}

/** Collects resources client-side; the wizard uploads/saves them after the job exists. */
export function ResourceInputs({
  resources,
  onChange,
  disabled,
}: {
  resources: PendingResource[];
  onChange: (next: PendingResource[]) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [youtube, setYoutube] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (resource: PendingResource) => {
    setError(null);
    onChange([...resources, resource]);
  };

  return (
    <fieldset className="flex flex-col gap-4" disabled={disabled}>
      <legend className="text-sm font-medium text-fg">Resources (optional)</legend>
      <div className="flex gap-2">
        <Input aria-label="Web page URL" placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const value = url.trim();
            if (!isSafeHttpUrl(value)) return setError("Enter a valid http(s) URL.");
            add({ id: nextId(), kind: "url", url: value });
            setUrl("");
          }}
        >
          Add URL
        </Button>
      </div>
      <div className="flex gap-2">
        <Input aria-label="YouTube URL" placeholder="https://www.youtube.com/watch?v=..." value={youtube} onChange={(e) => setYoutube(e.target.value)} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const value = youtube.trim();
            if (!youtubeIdFromUrl(value)) return setError("Enter a valid YouTube URL.");
            add({ id: nextId(), kind: "youtube", url: value });
            setYoutube("");
          }}
        >
          Add YouTube
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Textarea aria-label="Pasted text" rows={3} placeholder="Paste notes or reference text" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => {
            if (!text.trim()) return setError("Paste some text first.");
            add({ id: nextId(), kind: "text", text });
            setText("");
          }}
        >
          Add text
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="resource-pdf" className="text-sm text-muted">
          Upload PDF (max 20 MB)
        </label>
        <input
          id="resource-pdf"
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="text-sm text-muted"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > PDF_MAX_BYTES) setError("PDF is larger than 20 MB.");
            else if (file.type !== "application/pdf") setError("Only PDF files are supported.");
            else add({ id: nextId(), kind: "pdf", file });
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {resources.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-1.5">
              <span className="truncate text-muted">{label(resource)}</span>
              <Button type="button" variant="ghost" aria-label={`Remove ${label(resource)}`} onClick={() => onChange(resources.filter((r) => r.id !== resource.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
