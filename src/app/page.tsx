import Link from "next/link";
import { Suspense } from "react";
import { CourseCatalog, CourseCatalogSkeleton } from "@/components/landing/course-catalog";
import { FeaturesSection } from "@/components/landing/features-section";
import { FinalCta } from "@/components/landing/final-cta";
import { HeroDemo } from "@/components/landing/hero-demo";
import { KnowledgeGraphBackdrop } from "@/components/landing/knowledge-graph-backdrop";
import { PricingTeaser } from "@/components/landing/pricing-teaser";
import { Reveal } from "@/components/landing/reveal";
import { TutorSection } from "@/components/landing/tutor-section";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="relative isolate flex-1 overflow-x-clip">
      <KnowledgeGraphBackdrop />
      <section className="mx-auto grid w-full max-w-6xl items-center gap-16 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-accent" /> Courses with an AI tutor beside you
          </p>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Learn by doing, with a tutor that <span className="text-ember">knows where you are</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Video lessons, runnable code, quick quizzes and progress you can see. Start with a free
            course, upgrade for the rest.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button render={<Link href="/courses" />} className="px-6 py-3">
              Browse courses
            </Button>
            <Button render={<Link href="/pricing" />} variant="secondary" className="px-6 py-3">
              See pricing
            </Button>
          </div>
        </div>
        <HeroDemo />
      </section>

      <section id="courses" aria-labelledby="catalog" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Courses</p>
            <h2 id="catalog" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Pick a path and start today
            </h2>
          </div>
          <Link href="/courses" className="text-sm text-accent-soft hover:text-accent">
            View all courses →
          </Link>
        </Reveal>
        <Suspense fallback={<CourseCatalogSkeleton />}>
          <CourseCatalog />
        </Suspense>
      </section>

      <FeaturesSection />
      <TutorSection />
      <PricingTeaser />
      <FinalCta />
    </main>
  );
}
