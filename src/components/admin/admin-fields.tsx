"use client";

import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Textarea as TextareaPart } from "@ui-sdk/react/textarea";
import type { ComponentProps, ReactNode, SelectHTMLAttributes } from "react";
import { mergeClassName } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-subtle">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<typeof TextareaPart>) {
  return (
    <TextareaPart
      className={mergeClassName(
        "w-full rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2 text-sm text-fg placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Native select (styled): reliable for short fixed lists such as level, tier and status. */
export function SelectField({
  className,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select
      className={`w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className ?? ""}`}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SwitchField({
  label,
  checked,
  onCheckedChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-3 text-sm font-medium text-fg">
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={label}
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 p-0.5 transition-colors data-checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <SwitchThumb className="block size-4.5 rounded-full bg-fg transition-transform data-checked:translate-x-5 data-checked:bg-accent-fg" />
        </Switch>
        {label}
      </label>
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function StatusMessage({ kind, children }: { kind: "success" | "error"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${
        kind === "error"
          ? "border-danger/50 bg-danger/10 text-danger"
          : "border-success/40 bg-success/10 text-success"
      }`}
    >
      {children}
    </p>
  );
}
