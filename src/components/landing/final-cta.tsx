import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section aria-labelledby="cta" className="mx-auto w-full max-w-6xl px-4 pb-8 pt-16 sm:px-6">
      <Reveal className="relative overflow-hidden rounded-xl border border-accent/40 p-10 text-center shadow-glow sm:p-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 80% at 50% 0%, rgb(255 138 61 / 0.25), transparent), radial-gradient(40% 60% at 90% 100%, rgb(143 132 255 / 0.25), transparent)",
          }}
        />
        <h2 id="cta" className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
          Your next skill starts with <span className="text-ember">one lesson</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Create a free account, pick a course and get going in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button render={<Link href="/sign-up" />} className="px-6 py-3">
            Get started free
          </Button>
          <Button render={<Link href="/courses" />} variant="secondary" className="px-6 py-3">
            Browse courses
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
