"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { validateQuestion } from "../../../convex/lib/grading";
import type { Question } from "../../../convex/lib/engineTypes";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxIndicator } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { errorMessage } from "./admin-utils";
import { FormField, SelectField, StatusMessage, Textarea } from "./admin-fields";
import { HAND_EDIT } from "../../../convex/lib/handEditLimits";
import { SyncNotices } from "./sync-notices";
import { useAdminQuery } from "./use-admin-query";
import { useServerSync } from "./use-server-sync";

const kinds: { value: Question["kind"]; label: string }[] = [
  { value: "single", label: "Single choice" },
  { value: "multiple", label: "Multiple choice" },
  { value: "true_false", label: "True / false" },
];

type TestState = { questions: Question[]; pass: string; attempts: string };

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function nextId(questions: Question[]): string {
  const taken = new Set(questions.map((q) => q.id));
  for (let n = questions.length + 1; ; n++) if (!taken.has(`q${n}`)) return `q${n}`;
}

export function TestEditor({ chapterId, language, paused }: { chapterId: Id<"chapters">; language: string; paused?: boolean }) {
  const test = useAdminQuery(api.admin.getTest, { chapterId });
  if (test === undefined) return <p className="text-muted">Loading test...</p>;
  if (test === null) return <p className="text-muted">This chapter has no test yet.</p>;
  return (
    <TestForm
      key={test._id}
      chapterId={chapterId}
      language={language}
      paused={paused}
      server={{ questions: test.questions as Question[], pass: String(test.passPercent), attempts: String(test.maxAttempts) }}
    />
  );
}

function TestForm({
  chapterId,
  language,
  server,
  paused,
}: {
  chapterId: Id<"chapters">;
  language: string;
  server: TestState;
  paused?: boolean;
}) {
  const updateTest = useMutation(api.admin.updateTest);
  const sync = useServerSync<TestState>(server);
  const { questions, pass: passPercent, attempts: maxAttempts } = sync.value;
  const setQuestions = (next: Question[]) => sync.setValue({ ...sync.value, questions: next });
  const setPassPercent = (pass: string) => sync.setValue({ ...sync.value, pass });
  const setMaxAttempts = (attempts: string) => sync.setValue({ ...sync.value, attempts });
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function edit(next: Question[]) {
    setQuestions(next);
    setFeedback(null);
  }
  const patch = (qi: number, changes: Partial<Question>) =>
    edit(questions.map((q, i) => (i === qi ? { ...q, ...changes } : q)));

  function setKind(qi: number, kind: Question["kind"]) {
    const q = questions[qi];
    if (kind === "true_false") patch(qi, { kind, options: ["True", "False"], correct: q.correct.slice(0, 1) });
    else if (kind === "single") patch(qi, { kind, correct: q.correct.slice(0, 1) });
    else patch(qi, { kind });
  }

  function toggleCorrect(qi: number, oi: number, on: boolean) {
    const q = questions[qi];
    const correct = on ? [...new Set([...q.correct, oi])].sort((a, b) => a - b) : q.correct.filter((i) => i !== oi);
    patch(qi, { correct });
  }

  function removeOption(qi: number, oi: number) {
    const q = questions[qi];
    patch(qi, {
      options: q.options.filter((_, i) => i !== oi),
      correct: q.correct.filter((i) => i !== oi).map((i) => (i > oi ? i - 1 : i)),
    });
  }

  function problem(): string | null {
    const pass = Number(passPercent);
    const attempts = Number(maxAttempts);
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) return "Pass mark must be a whole number from 1 to 100.";
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > HAND_EDIT.maxAttemptsCap) {
      return `Max attempts must be a whole number from 1 to ${HAND_EDIT.maxAttemptsCap}.`;
    }
    if (questions.length < 1 || questions.length > HAND_EDIT.maxQuestions) {
      return `A test needs 1 to ${HAND_EDIT.maxQuestions} questions.`;
    }
    for (const [i, q] of questions.entries()) {
      if (!q.prompt.trim()) return `Question ${i + 1}: the prompt is required.`;
      if (q.options.some((o) => !o.trim())) return `Question ${i + 1}: every option needs text.`;
      if (!q.explanation.trim()) return `Question ${i + 1}: the explanation is required.`;
      const issue = validateQuestion(q);
      if (issue) return `Question ${i + 1}: ${issue}.`;
    }
    return null;
  }

  async function save() {
    if (paused || sync.conflict) return;
    const found = problem();
    if (found) return setFeedback({ kind: "error", text: found });
    setSaving(true);
    setFeedback(null);
    try {
      const cleaned = questions.map((q) => ({
        ...q,
        prompt: q.prompt.trim(),
        options: q.options.map((o) => o.trim()),
        explanation: q.explanation.trim(),
      }));
      await updateTest({ chapterId, questions: cleaned, passPercent: Number(passPercent), maxAttempts: Number(maxAttempts) });
      sync.markSaved({ questions: cleaned, pass: String(Number(passPercent)), attempts: String(Number(maxAttempts)) });
      setFeedback({ kind: "success", text: "Test saved." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Chapter test editor" className="flex flex-col gap-4" lang={language} dir={language === "he" ? "rtl" : undefined}>
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
        Saving changes question content creates a new version. Earlier passes still count.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Pass mark (%)" htmlFor="test-pass">
          <Input id="test-pass" inputMode="numeric" value={passPercent} onChange={(e) => setPassPercent(e.target.value)} />
        </FormField>
        <FormField label="Max attempts" htmlFor="test-attempts">
          <Input id="test-attempts" inputMode="numeric" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
        </FormField>
      </div>
      <ol className="flex flex-col gap-4">
        {questions.map((q, qi) => {
          const n = qi + 1;
          return (
            <li key={q.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold">Question {n}</h4>
                <SelectField aria-label={`Question ${n} kind`} className="w-auto" options={kinds} value={q.kind} onChange={(e) => setKind(qi, e.target.value as Question["kind"])} />
                <Button type="button" variant="ghost" aria-label={`Move question ${n} up`} disabled={qi === 0} onClick={() => edit(move(questions, qi, qi - 1))}>
                  ↑
                </Button>
                <Button type="button" variant="ghost" aria-label={`Move question ${n} down`} disabled={qi === questions.length - 1} onClick={() => edit(move(questions, qi, qi + 1))}>
                  ↓
                </Button>
                <Button type="button" variant="ghost" className="text-danger" aria-label={`Remove question ${n}`} disabled={questions.length === 1} onClick={() => edit(questions.filter((_, i) => i !== qi))}>
                  Remove
                </Button>
              </div>
              <Textarea aria-label={`Question ${n} prompt`} dir="auto" rows={2} value={q.prompt} onChange={(e) => patch(qi, { prompt: e.target.value })} />
              <ul className="flex flex-col gap-2">
                {q.options.map((option, oi) => (
                  <li key={oi} className="flex items-center gap-2">
                    <Checkbox aria-label={`Question ${n} option ${oi + 1} correct`} checked={q.correct.includes(oi)} onCheckedChange={(on) => toggleCorrect(qi, oi, on === true)}>
                      <CheckboxIndicator />
                    </Checkbox>
                    <Input aria-label={`Question ${n} option ${oi + 1}`} dir="auto" value={option} disabled={q.kind === "true_false"} onChange={(e) => patch(qi, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })} className="flex-1" />
                    {q.kind !== "true_false" ? (
                      <Button type="button" variant="ghost" aria-label={`Remove option ${oi + 1} of question ${n}`} disabled={q.options.length <= 2} onClick={() => removeOption(qi, oi)}>
                        ✕
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {q.kind !== "true_false" ? (
                <div>
                  <Button type="button" variant="secondary" aria-label={`Add option to question ${n}`} onClick={() => patch(qi, { options: [...q.options, ""] })}>
                    Add option
                  </Button>
                </div>
              ) : null}
              <Textarea aria-label={`Question ${n} explanation`} dir="auto" rows={2} placeholder="Explanation shown after submitting" value={q.explanation} onChange={(e) => patch(qi, { explanation: e.target.value })} />
            </li>
          );
        })}
      </ol>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={questions.length >= HAND_EDIT.maxQuestions}
          onClick={() => edit([...questions, { id: nextId(questions), kind: "single", prompt: "", options: ["", ""], correct: [0], explanation: "" }])}
        >
          Add question
        </Button>
      </div>
      <SyncNotices paused={paused} conflict={sync.conflict} onDiscard={sync.discard} />
      {feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null}
      <div>
        <Button type="button" disabled={saving || paused || sync.conflict} onClick={() => void save()}>
          Save test
        </Button>
      </div>
    </section>
  );
}
