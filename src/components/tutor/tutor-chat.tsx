"use client";

import { useAuth } from "@clerk/nextjs";
import { showsActivity } from "eve/events";
import { type EveMessagePart, useEveAgent } from "eve/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { QuizBlock } from "@/components/markdown/quiz-block";
import { parseQuiz } from "@/components/markdown/quiz";
import { Button } from "@/components/ui/button";
import { Input, InputClear, InputGroup } from "@/components/ui/input";
import { type PageContext, parsePathname } from "./page-context";

export function suggestionsFor(context: PageContext): { label: string; prompt: string }[] {
  if (context.lessonSlug) {
    return [
      { label: "Explain this lesson", prompt: "Explain the lesson I'm looking at in simple terms." },
      { label: "Quiz me", prompt: "Quiz me on this lesson, one question at a time." },
      { label: "What should I learn next?", prompt: "What should I learn next, given my progress?" },
    ];
  }
  if (context.courseSlug) {
    return [
      { label: "Summarise this course", prompt: "Give me an overview of this course and who it's for." },
      { label: "Where should I start?", prompt: "Which lesson of this course should I start with?" },
      { label: "What should I learn next?", prompt: "What should I learn next, given my progress?" },
    ];
  }
  return [
    { label: "What should I learn next?", prompt: "What should I learn next, given my progress?" },
    { label: "Recommend a course", prompt: "Recommend a course I haven't done yet." },
    { label: "Review my progress", prompt: "How am I doing so far? Summarise my progress." },
  ];
}

function PartView({ part }: { part: EveMessagePart }) {
  if (part.type === "text") {
    return part.text ? <LessonMarkdown source={part.text} /> : null;
  }
  if (part.type === "tool" && part.name === "show_quiz") {
    if (part.state !== "completed") return null;
    const output = part.output as { shown?: boolean; quiz?: unknown } | undefined;
    if (!output?.shown) return null;
    const parsed = parseQuiz(JSON.stringify(output.quiz));
    return parsed.ok ? <QuizBlock quiz={parsed.quiz} /> : null;
  }
  if (part.type === "tool" && showsActivity(part)) {
    const failed = part.state === "failed" || part.state === "rejected";
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted">
        <span>{part.label ?? part.name}</span>
        <span className="font-medium">
          {part.state === "completed" ? "Done" : failed ? "Failed" : part.state === "cancelled" ? "Cancelled" : "Running"}
        </span>
      </div>
    );
  }
  return null;
}

function hasVisiblePart(part: EveMessagePart): boolean {
  if (part.type === "text") return part.text.length > 0;
  if (part.type === "tool") return part.name === "show_quiz" || showsActivity(part);
  return false;
}

const DEFAULT_CONTEXT = parsePathname("/");

export function TutorChat({ pageContext }: { pageContext?: PageContext }) {
  const { getToken } = useAuth();
  const context = pageContext ?? DEFAULT_CONTEXT;
  const contextRef = useRef<PageContext>(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const agent = useEveAgent({
    agent: "learnly",
    // Resolved before every request (incl. stream reconnects): Clerk tokens live 60s.
    auth: { bearer: async () => (await getToken()) ?? "" },
    prepareSend: (payload) =>
      payload.message === undefined ? payload : { ...payload, clientContext: { ...contextRef.current } },
  });
  const [draft, setDraft] = useState("");
  const isResuming = agent.status === "resuming";
  const isBusy = agent.status === "busy";
  const canSend = draft.trim().length > 0 && !isResuming;
  const suggestions = suggestionsFor(context);

  async function submitPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isResuming) return;
    setDraft("");
    await agent.send(trimmed);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(draft);
  }

  const visible = agent.messages.filter((m) => m.parts.some(hasVisiblePart));

  return (
    <section aria-label="Learnly conversation" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${isBusy ? "bg-accent" : isResuming ? "bg-subtle" : "bg-success"}`}
          />
          {isBusy ? "Learnly is thinking…" : isResuming ? "Reconnecting…" : "Ready to help"}
        </span>
        <span className="flex items-center gap-1">
          {isBusy ? (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void agent.cancel()}>
              Stop response
            </Button>
          ) : null}
          {agent.messages.length > 0 ? (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => {
                agent.newSession();
                setDraft("");
              }}
            >
              Start new chat
            </Button>
          ) : null}
        </span>
      </div>

      {agent.error ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {agent.error.message}
        </div>
      ) : null}

      <div role="log" aria-label="Messages" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <p className="text-sm text-muted">
              I&apos;m Learnly, an AI tutor. I know the catalog, your progress and the lesson you&apos;re on.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <Button
                  key={item.label}
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  disabled={isResuming}
                  onClick={() => void submitPrompt(item.prompt)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          visible.map((message) => {
            const isUser = message.role === "user";
            return (
              <article
                key={message.id}
                className={`flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm ${
                  isUser ? "ml-8 border-line-strong bg-surface-3" : "mr-4 border-line bg-surface-2"
                }`}
              >
                <header className="text-xs font-medium text-subtle">{isUser ? "You" : "Learnly"}</header>
                <div className="flex flex-col gap-2">
                  {message.parts.map((part, index) => (
                    <PartView key={"id" in part && part.id ? part.id : index} part={part} />
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <Input
            aria-label="Message Learnly"
            name="message"
            placeholder="Ask about a course or lesson…"
            value={draft}
            disabled={isResuming}
            onValueChange={setDraft}
            className="border-0 px-0 py-0.5 focus-visible:outline-none"
          />
          <InputClear aria-label="Clear message">Clear</InputClear>
        </InputGroup>
        <Button type="submit" disabled={!canSend}>
          Send message
        </Button>
      </form>
    </section>
  );
}
