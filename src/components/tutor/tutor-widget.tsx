"use client";

import { useAuth } from "@clerk/nextjs";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { parsePathname } from "./page-context";
import { TutorChat } from "./tutor-chat";

const HIDDEN_PREFIXES = ["/admin", "/sign-in", "/sign-up"];

const triggerClass =
  "fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg shadow-lift hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const panelClass =
  "z-50 flex h-[min(36rem,var(--available-height))] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-line-strong bg-surface p-4 text-fg shadow-lift";

function TutorWidgetInner() {
  const { isLoaded, isSignedIn, has, sessionClaims } = useAuth();
  const pathname = usePathname() ?? "/";

  if (!isLoaded || !isSignedIn) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const isAdmin = (sessionClaims?.metadata as { role?: unknown } | undefined)?.role === "admin";
  // Client gate is UX only; the agent channel verifies the plan on the server.
  const isPro = isAdmin || Boolean(has?.({ plan: "pro" }));

  if (!isPro) {
    return (
      <Popover modal="trap-focus">
        <PopoverTrigger className={triggerClass} aria-label="Learnly tutor (Pro feature)">
          <span aria-hidden="true">🔒</span> Ask Learnly
        </PopoverTrigger>
        <PopoverContent side="top" align="end" sideOffset={12} className={`${panelClass} h-auto`}>
          <PopoverTitle className="font-display text-lg">Meet your AI tutor</PopoverTitle>
          <PopoverDescription className="text-sm text-muted">
            Learnly explains the lesson you&apos;re on, quizzes you and plans what to learn next. It&apos;s included
            with Pro.
          </PopoverDescription>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-soft"
          >
            See Pro plans
          </Link>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover modal="trap-focus">
      <PopoverTrigger className={triggerClass} aria-label="Open Learnly tutor">
        Ask Learnly
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={12} keepMounted className={panelClass}>
        <PopoverTitle className="font-display text-lg">Learnly tutor</PopoverTitle>
        <PopoverDescription className="sr-only">
          An AI tutor that knows your courses, progress and current lesson.
        </PopoverDescription>
        <TutorChat pageContext={parsePathname(pathname)} />
      </PopoverContent>
    </Popover>
  );
}

/** Floating tutor, mounted once in the root layout. `usePathname` needs Suspense under Cache Components. */
export function TutorWidget() {
  return (
    <Suspense fallback={null}>
      <TutorWidgetInner />
    </Suspense>
  );
}
