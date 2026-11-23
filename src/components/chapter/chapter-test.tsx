"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { RTL_LANGUAGES, type Language } from "../../../convex/lib/engineTypes";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { signInHref } from "@/components/course/format";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "@/components/ui/checkbox";
import { Radio, RadioGroup, RadioIndicator } from "@/components/ui/radio";
import { cn } from "@/lib/utils";

type Answers = Record<string, number[]>;
type SubmitResult = {
  scorePercent: number;
  passed: boolean;
  attemptsLeft: number;
  results: { id: string; correct: boolean; correctOptions: number[]; explanation: string }[];
};

const optionClass =
  "flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong";

const ERROR_MESSAGES: Record<string, string> = {
  NO_ATTEMPTS_LEFT: "No attempts left",
  LOCKED: "This test is locked for your account",
  UNAUTHENTICATED: "Sign in to take this test",
  INVALID_ANSWERS: "Some answers were invalid. Please review and submit again.",
  NOT_FOUND: "This test is no longer available",
};

function errorMessage(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "string" && e.data in ERROR_MESSAGES) {
    return ERROR_MESSAGES[e.data];
  }
  return "Something went wrong. Please try again.";
}

export function ChapterTest({ testId }: { testId: Id<"chapterTests"> }) {
  const data = useQuery(api.tests.getForViewer, { testId });
  const viewer = useQuery(api.viewer.get);
  // Held here (not in the keyed player) so it survives the remount a new version causes.
  // Cleared when the learner next answers or submits.
  const [updated, setUpdated] = useState(false);

  if (data === undefined || viewer === undefined) {
    return <div aria-busy="true" aria-label="Loading test" className="h-48 animate-pulse rounded-xl border border-line bg-surface" />;
  }
  if (data === null) {
    if (!viewer.signedIn) {
      return (
        <p className="text-sm text-muted">
          <Link
            href={signInHref(typeof window === "undefined" ? "/" : window.location.pathname)}
            className="font-semibold text-accent underline"
          >
            Sign in
          </Link>{" "}
          to take this test.
        </p>
      );
    }
    return <p className="text-sm text-muted">This test is not available.</p>;
  }

  // Keyed by version: a new version remounts the player, dropping stale answers and results.
  return (
    <TestPlayer
      key={data.version}
      testId={testId}
      data={data}
      updated={updated}
      onChanged={() => setUpdated(true)}
      onDismiss={() => setUpdated(false)}
    />
  );
}

type TestData = NonNullable<FunctionReturnType<typeof api.tests.getForViewer>>;

function TestPlayer({
  testId,
  data,
  updated,
  onChanged,
  onDismiss,
}: {
  testId: Id<"chapterTests">;
  data: TestData;
  updated: boolean;
  onChanged: () => void;
  onDismiss: () => void;
}) {
  const submitTest = useMutation(api.tests.submit);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rtl = RTL_LANGUAGES.includes(data.language as Language);
  const dirProps = rtl ? { dir: "rtl" as const, lang: data.language } : { lang: data.language };
  const exhausted = !result && data.attemptsUsed >= data.maxAttempts;
  const complete = data.questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  function setAnswer(id: string, values: number[]) {
    onDismiss();
    setAnswers((prev) => ({ ...prev, [id]: values }));
  }

  async function onSubmit() {
    if (pending || !complete) return;
    setPending(true);
    setError(null);
    onDismiss();
    try {
      setResult(await submitTest({ testId, version: data.version, answers }));
    } catch (e) {
      if (e instanceof ConvexError && e.data === "TEST_CHANGED") {
        onChanged();
        setAnswers({});
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setPending(false);
    }
  }

  function tryAgain() {
    setResult(null);
    setAnswers({});
    setError(null);
  }

  if (exhausted) {
    return (
      <div {...dirProps} className="space-y-3">
        {data.best ? (
          <p className="text-sm">
            Best score: <strong>{data.best.scorePercent}%</strong> ({data.best.passed ? "Passed" : "Failed"})
          </p>
        ) : null}
        <p role="status" className="text-sm font-medium text-danger">No attempts left</p>
      </div>
    );
  }

  if (result) {
    const byId = new Map(result.results.map((r) => [r.id, r]));
    return (
      <div {...dirProps} className="space-y-6">
        <div role="status" aria-live="polite" className="rounded-xl border border-line-strong bg-surface-2 p-5">
          <p className="font-display text-3xl font-semibold">{result.scorePercent}%</p>
          <p className={cn("mt-1 text-sm font-semibold", result.passed ? "text-success" : "text-danger")}>
            {result.passed ? "Passed" : "Failed"}
          </p>
          <p className="text-xs text-muted">Pass mark: {data.passPercent}%</p>
        </div>
        <ol className="space-y-4">
          {data.questions.map((q) => {
            const r = byId.get(q.id);
            return (
              <li key={q.id} className="rounded-xl border border-line bg-surface p-4">
                <p dir="auto" className="font-medium">{q.prompt}</p>
                {r ? (
                  <>
                    <p className={cn("mt-2 text-sm font-semibold", r.correct ? "text-success" : "text-danger")}>
                      {r.correct ? "Correct" : "Incorrect"}
                    </p>
                    <p dir="auto" className="mt-1 text-sm">
                      Correct answer: {r.correctOptions.map((i) => q.options[i]).join(", ")}
                    </p>
                    <p dir="auto" className="mt-1 text-sm text-muted">{r.explanation}</p>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
        {result.attemptsLeft > 0 ? (
          <Button variant="secondary" onClick={tryAgain}>
            Try again ({result.attemptsLeft} left)
          </Button>
        ) : (
          <p className="text-sm font-medium text-danger">No attempts left</p>
        )}
      </div>
    );
  }

  return (
    <form
      {...dirProps}
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
    >
      {updated ? (
        <p role="status" className="rounded-lg border border-line-strong bg-surface-2 p-3 text-sm">
          This test was updated
        </p>
      ) : null}
      <ol className="space-y-5">
        {data.questions.map((q, qi) => {
          const labelId = `q-${q.id}`;
          const selected = answers[q.id] ?? [];
          return (
            <li key={`${data.version}-${q.id}`} className="rounded-xl border border-line bg-surface-2 p-4">
              <p id={labelId} dir="auto" className="font-medium">
                <span className="sr-only">{`Question ${qi + 1}: `}</span>
                {q.prompt}
              </p>
              {q.kind === "multiple" ? (
                <CheckboxGroup
                  aria-labelledby={labelId}
                  className="mt-3"
                  value={selected.map(String)}
                  onValueChange={(values) => setAnswer(q.id, values.map(Number).sort((a, b) => a - b))}
                >
                  {q.options.map((option, i) => (
                    <label key={i} className={optionClass}>
                      <Checkbox value={String(i)}>
                        <CheckboxIndicator />
                      </Checkbox>
                      <span dir="auto">{option}</span>
                    </label>
                  ))}
                </CheckboxGroup>
              ) : (
                <RadioGroup
                  aria-labelledby={labelId}
                  className="mt-3"
                  value={selected.length ? String(selected[0]) : ""}
                  onValueChange={(value) => setAnswer(q.id, [Number(value)])}
                >
                  {q.options.map((option, i) => (
                    <label key={i} className={optionClass}>
                      <Radio value={String(i)}>
                        <RadioIndicator />
                      </Radio>
                      <span dir="auto">{option}</span>
                    </label>
                  ))}
                </RadioGroup>
              )}
            </li>
          );
        })}
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : null}
      <Button type="submit" disabled={!complete || pending}>
        Submit
      </Button>
    </form>
  );
}

/** Resolves the chapter's test id, then renders the player. */
export function ChapterTestView({ courseSlug, chapterSlug }: { courseSlug: string; chapterSlug: string }) {
  const chapter = useQuery(api.chapters.getForViewer, { courseSlug, chapterSlug });
  if (chapter === undefined) {
    return <div aria-busy="true" aria-label="Loading test" className="h-48 animate-pulse rounded-xl border border-line bg-surface" />;
  }
  if (chapter === null || !chapter.test) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/courses/${courseSlug}`} className="text-sm text-muted hover:text-fg">
        {chapter.course.title}
      </Link>
      <h1 className="font-display text-2xl font-semibold" dir="auto">
        {chapter.chapter.title}: Chapter test
      </h1>
      <ChapterTest testId={chapter.test._id} />
    </div>
  );
}
