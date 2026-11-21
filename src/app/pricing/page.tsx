import type { Metadata } from "next";
import { Suspense } from "react";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { PricingPlans } from "@/components/pricing/pricing-plans";
import { getProPlanId } from "@/components/pricing/pro-plan-id";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free. Go Pro for every course and your own AI tutor.",
};

async function Plans() {
  const proPlanId = await getProPlanId();
  return <PricingPlans proPlanId={proPlanId} />;
}

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Simple pricing, <span className="text-ember">serious learning</span>
        </h1>
        <p className="mt-4 text-lg text-muted">
          Start free and upgrade when you want every course and a tutor that never gets tired of
          your questions.
        </p>
      </header>
      <Suspense fallback={<div className="min-h-[34rem]" aria-busy="true" />}>
        <Plans />
      </Suspense>
      <section aria-labelledby="faq" className="mx-auto mt-24 max-w-2xl">
        <h2 id="faq" className="mb-6 font-display text-2xl font-semibold">
          Questions, answered
        </h2>
        <PricingFaq />
      </section>
    </main>
  );
}
