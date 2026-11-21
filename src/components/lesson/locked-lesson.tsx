import Link from "next/link";
import { signInHref } from "@/components/course/format";
import { LockIcon } from "@/components/course/icons";

type Props = {
  title: string;
  summary: string;
  signedIn: boolean;
  tier: "free" | "pro";
  returnTo: string;
};

/** Never receives the lesson body: only the title and summary are shown, behind a blurred placeholder. */
export function LockedLesson({ title, summary, signedIn, tier, returnTo }: Props) {
  const needsPro = signedIn;
  return (
    <section aria-labelledby="locked-heading" className="relative overflow-hidden rounded-xl border border-line bg-surface">
      <div aria-hidden="true" className="select-none space-y-3 p-8 blur-sm">
        <div className="h-5 w-2/3 rounded bg-surface-3" />
        <div className="h-3 w-full rounded bg-surface-3" />
        <div className="h-3 w-11/12 rounded bg-surface-3" />
        <div className="h-3 w-4/5 rounded bg-surface-3" />
        <div className="h-24 w-full rounded bg-surface-2" />
        <div className="h-3 w-3/4 rounded bg-surface-3" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-bg/60 p-4">
        <div className="w-full max-w-md rounded-xl border border-line-strong bg-surface-2 p-6 text-center shadow-lift">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-iris/15 text-iris-soft">
            <LockIcon width={20} height={20} />
          </span>
          <h2 id="locked-heading" className="mt-3 font-display text-xl font-semibold">
            {needsPro ? "This lesson is part of Pro" : "Sign in to continue"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            <strong className="text-fg">{title}</strong>
            {summary ? `: ${summary}` : null}
          </p>
          <p className="mt-2 text-sm text-muted">
            {needsPro
              ? "Upgrade to unlock every lesson in this course."
              : tier === "pro"
                ? "Sign in to watch the free previews, or upgrade to unlock the whole course."
                : "Create a free account to access this lesson."}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            {needsPro ? (
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-lg bg-iris px-4 py-2.5 text-sm font-semibold text-bg hover:bg-iris-soft"
              >
                Upgrade to Pro
              </Link>
            ) : (
              <>
                <Link
                  href={signInHref(returnTo)}
                  className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-soft"
                >
                  Sign in
                </Link>
                {tier === "pro" ? (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold hover:bg-surface-3"
                  >
                    See Pro plan
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
