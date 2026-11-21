"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "@/components/course/icons";
import { signInHref } from "@/components/course/format";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Props = {
  lessonId: Id<"lessons">;
  courseId: Id<"courses">;
  completed: boolean;
  signedIn: boolean;
  returnTo: string;
};

export function CompleteToggle({ lessonId, courseId, completed, signedIn, returnTo }: Props) {
  const setComplete = useMutation(api.progress.setComplete).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.progress.forCourse, { courseId });
    if (current === undefined) return;
    const without = current.filter((id) => id !== args.lessonId);
    store.setQuery(api.progress.forCourse, { courseId }, args.complete ? [...without, args.lessonId] : without);
  });
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={signInHref(returnTo)} className="text-sm font-medium text-accent-soft underline underline-offset-4">
        Sign in to track your progress
      </Link>
    );
  }

  async function toggle() {
    setError(null);
    try {
      await setComplete({ lessonId, complete: !completed });
    } catch {
      setError("Could not update progress. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant={completed ? "secondary" : "primary"}
        aria-pressed={completed}
        onClick={toggle}
        className="px-4 py-2.5"
      >
        {completed ? (
          <>
            <CheckIcon className="text-success" />
            Completed
          </>
        ) : (
          "Mark as complete"
        )}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
