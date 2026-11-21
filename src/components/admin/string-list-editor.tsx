"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Editable list of short strings (tags, outcomes). */
export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const id = useId();
  const set = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">{label}</legend>
      {items.map((item, index) => (
        <div key={`${id}-${index}`} className="flex items-center gap-2">
          <Input
            value={item}
            onValueChange={(value) => set(index, value)}
            placeholder={placeholder}
            aria-label={`${label} ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${label} ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="secondary" onClick={() => onChange([...items, ""])}>
          Add {label.toLowerCase().replace(/s$/, "")}
        </Button>
      </div>
    </fieldset>
  );
}
