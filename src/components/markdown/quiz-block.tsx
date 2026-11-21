"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup, RadioIndicator } from "@/components/ui/radio";
import { cn } from "@/lib/utils";
import type { Quiz } from "./quiz";

type Phase = "answering" | "checked";

/** Renders `inline code` spans inside plain quiz text. */
function InlineText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-surface-3 px-1 font-mono text-[0.9em] text-accent-soft">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function QuizBlock({ quiz }: { quiz: Quiz }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("answering");

  const checked = phase === "checked";
  const correct = checked && selected === String(quiz.answer);
  const questionId = `quiz-${quiz.question.replace(/\W+/g, "-").slice(0, 40)}`;

  function reset() {
    setSelected(null);
    setPhase("answering");
  }

  return (
    <section
      aria-labelledby={questionId}
      className="not-prose my-6 rounded-xl border border-line-strong bg-surface-2 p-5 shadow-soft"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Quick check</p>
      <p id={questionId} className="mt-2 font-display text-lg font-semibold leading-snug">
        <InlineText text={quiz.question} />
      </p>

      <RadioGroup
        aria-labelledby={questionId}
        value={selected ?? ""}
        onValueChange={(value) => setSelected(value)}
        readOnly={checked}
        className="mt-4"
      >
        {quiz.options.map((option, index) => {
          const value = String(index);
          const isAnswer = checked && index === quiz.answer;
          const isWrongPick = checked && selected === value && index !== quiz.answer;
          return (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                !checked && "border-line bg-surface hover:border-line-strong",
                isAnswer && "border-success/70 bg-success/10",
                isWrongPick && "border-danger/70 bg-danger/10",
                checked && !isAnswer && !isWrongPick && "border-line bg-surface opacity-70",
              )}
            >
              <Radio value={value}>
                <RadioIndicator />
              </Radio>
              <span className="flex-1">
                <InlineText text={option} />
              </span>
              {isAnswer ? <span className="text-xs font-medium text-success">Correct answer</span> : null}
              {isWrongPick ? <span className="text-xs font-medium text-danger">Your answer</span> : null}
            </label>
          );
        })}
      </RadioGroup>

      <div className="mt-4 flex items-center gap-3">
        {checked ? (
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        ) : (
          <Button disabled={selected === null} onClick={() => setPhase("checked")}>
            Check answer
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite" className="mt-3">
        {checked ? (
          <p className={cn("text-sm leading-relaxed", correct ? "text-success" : "text-danger")}>
            <strong>{correct ? "Correct!" : "Not quite."}</strong>
            {quiz.explanation ? (
              <span className="text-fg"> <InlineText text={quiz.explanation} /></span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
