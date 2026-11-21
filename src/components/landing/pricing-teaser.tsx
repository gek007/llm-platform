import Link from "next/link";
import { PRO_PRICING, formatUsd, monthsFree } from "@/components/pricing/pricing-config";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function PricingTeaser() {
  return (
    <section aria-labelledby="teaser" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <Reveal className="grid items-center gap-8 rounded-xl border border-line bg-surface p-8 sm:p-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 id="teaser" className="font-display text-3xl font-semibold tracking-tight">
            Start free. Go Pro when you are ready.
          </h2>
          <p className="mt-3 max-w-prose text-muted">
            Free courses and previews cost nothing. Pro unlocks every course and the AI tutor for{" "}
            {formatUsd(PRO_PRICING.monthly)} a month, or {formatUsd(PRO_PRICING.yearly)} a year
            ({monthsFree} months free).
          </p>
        </div>
        <div className="md:justify-self-end">
          <Button render={<Link href="/pricing" />} variant="secondary" className="px-6 py-3">
            Compare plans
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
