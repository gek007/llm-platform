"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signInHref } from "@/components/course/format";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

export type EnrollViewer = { signedIn: boolean; isPro: boolean; isAdmin: boolean };

type Props = {
  courseId: Id<"courses">;
  courseSlug: string;
  tier: "free" | "pro";
  /** `undefined` while the viewer query is loading. */
  viewer: EnrollViewer | undefined;
  enrolled: boolean;
  continueHref: string;
};

const linkButton =
  "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold shadow-soft transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function EnrollButton({ courseId, courseSlug, tier, viewer, enrolled, continueHref }: Props) {
  const enroll = useMutation(api.enrollments.enroll);
  const [pending, setPending] = useState(false);
  const [proRequired, setProRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!viewer) {
    return (
      <Button disabled className="px-5 py-2.5">
        Loading…
      </Button>
    );
  }

  if (!viewer.signedIn) {
    return (
      <Link
        href={signInHref(`/courses/${courseSlug}`)}
        className={`${linkButton} bg-accent text-accent-fg hover:bg-accent-soft`}
      >
        Sign in to enroll
      </Link>
    );
  }

  if (enrolled) {
    return (
      <Link href={continueHref} className={`${linkButton} bg-accent text-accent-fg hover:bg-accent-soft`}>
        Continue
      </Link>
    );
  }

  if (proRequired || (tier === "pro" && !viewer.isPro && !viewer.isAdmin)) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Link href="/pricing" className={`${linkButton} bg-iris text-bg hover:bg-iris-soft`}>
          Upgrade to Pro
        </Link>
        <p className="text-xs text-muted">This course is part of the Pro plan.</p>
      </div>
    );
  }

  async function onEnroll() {
    setPending(true);
    setError(null);
    try {
      await enroll({ courseId });
    } catch (e) {
      if (e instanceof ConvexError && e.data === "PRO_REQUIRED") setProRequired(true);
      else setError("Could not enroll. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={onEnroll} disabled={pending} className="px-5 py-2.5">
        {pending ? "Enrolling…" : "Enroll"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
