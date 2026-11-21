"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function CodeBlock({
  code,
  language,
  children,
}: {
  code: string;
  language?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="not-prose group my-6 overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-1.5">
        <span className="font-mono text-xs uppercase tracking-wider text-subtle">
          {language ?? "text"}
        </span>
        <Button
          variant="ghost"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${language ?? "code"} to clipboard`}
          className="px-2 py-1 text-xs"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className={`hljs font-mono${language ? ` language-${language}` : ""}`}>{children}</code>
      </pre>
    </div>
  );
}
