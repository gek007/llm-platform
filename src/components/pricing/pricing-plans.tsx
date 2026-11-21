"use client";

import { SignInButton, useAuth, useClerk } from "@clerk/nextjs";
import { CheckoutButton } from "@clerk/nextjs/experimental";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CLERK_PLAN_PERIOD,
  type BillingPeriod,
  PRO_PRICING,
  formatUsd,
  freeFeatures,
  monthsFree,
  proFeatures,
} from "./pricing-config";

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-success">
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-3 text-sm text-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ProCta({ planId, period }: { planId: string | null; period: BillingPeriod }) {
  const { isLoaded, isSignedIn, has } = useAuth();
  const { openUserProfile } = useClerk();
  const className = "mt-8 w-full py-3";

  if (!planId) {
    return (
      <div className="mt-8">
        <Button disabled className="w-full py-3">
          Upgrade to Pro
        </Button>
        <p role="note" className="mt-3 text-xs text-warning">
          Billing is not configured: the Clerk plan with slug &quot;pro&quot; was not found. Set
          NEXT_PUBLIC_CLERK_PRO_PLAN_ID.
        </p>
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <Button disabled className={className}>
        Upgrade to Pro
      </Button>
    );
  }
  if (!isSignedIn) {
    return (
      <SignInButton forceRedirectUrl="/pricing" signUpForceRedirectUrl="/pricing">
        <Button className={className}>Sign in to upgrade</Button>
      </SignInButton>
    );
  }
  if (has?.({ plan: "pro" })) {
    return (
      <div className="mt-8 flex flex-col gap-3">
        <p className="rounded-lg border border-success/40 bg-success/10 px-4 py-2.5 text-center text-sm font-medium text-success">
          You&apos;re on Pro
        </p>
        <Button variant="secondary" className="w-full py-3" onClick={() => openUserProfile()}>
          Manage subscription
        </Button>
        <Button variant="ghost" render={<Link href="/courses" />} className="w-full">
          Browse Pro courses
        </Button>
      </div>
    );
  }
  return (
    <CheckoutButton
      planId={planId}
      planPeriod={CLERK_PLAN_PERIOD[period]}
      for="user"
      newSubscriptionRedirectUrl="/dashboard"
    >
      <Button className={className}>Upgrade to Pro</Button>
    </CheckoutButton>
  );
}

export function PricingPlans({ proPlanId }: { proPlanId: string | null }) {
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const yearly = period === "yearly";

  return (
    <div>
      <div className="flex flex-col items-center gap-3">
        <SegmentedControl
          aria-label="Billing period"
          value={period}
          onValueChange={(value) => setPeriod(value as BillingPeriod)}
          className="relative isolate inline-flex rounded-full border border-line-strong bg-surface-2 p-1"
        >
          <SegmentedControlIndicator className="absolute -z-10 rounded-full bg-accent [top:var(--segmented-control-indicator-top)] [left:var(--segmented-control-indicator-left)] [width:var(--segmented-control-indicator-width)] [height:var(--segmented-control-indicator-height)] transition-[top,left,width,height] duration-200 data-[activation-direction=none]:transition-none" />
          <SegmentedControlItem
            value="monthly"
            className="cursor-pointer rounded-full px-5 py-2 text-sm font-semibold text-muted transition-colors data-checked:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Monthly
          </SegmentedControlItem>
          <SegmentedControlItem
            value="yearly"
            className="cursor-pointer rounded-full px-5 py-2 text-sm font-semibold text-muted transition-colors data-checked:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Yearly
          </SegmentedControlItem>
        </SegmentedControl>
        <p className="text-sm text-success">{monthsFree} months free when you pay yearly</p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        <section
          aria-labelledby="plan-free"
          className="rounded-xl border border-line bg-surface p-7 shadow-soft"
        >
          <h2 id="plan-free" className="font-display text-2xl font-semibold">
            Free
          </h2>
          <p className="mt-1 text-sm text-muted">Start learning today, no card needed.</p>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="font-display text-5xl font-semibold">$0</span>
            <span className="text-sm text-muted">forever</span>
          </p>
          <Button variant="secondary" render={<Link href="/courses" />} className="mt-8 w-full py-3">
            Browse free courses
          </Button>
          <FeatureList items={freeFeatures} />
        </section>

        <section
          aria-labelledby="plan-pro"
          className="relative rounded-xl border border-accent/50 bg-surface-2 p-7 shadow-glow"
        >
          <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-fg">
            Most popular
          </span>
          <h2 id="plan-pro" className="font-display text-2xl font-semibold">
            Pro
          </h2>
          <p className="mt-1 text-sm text-muted">Every course plus your own AI tutor.</p>
          <p className="mt-6 flex items-baseline gap-1" data-testid="pro-price">
            <span className="font-display text-5xl font-semibold">
              {formatUsd(yearly ? PRO_PRICING.yearly : PRO_PRICING.monthly)}
            </span>
            <span className="text-sm text-muted">{yearly ? "per year" : "per month"}</span>
          </p>
          <p className="mt-1 h-5 text-xs text-muted">
            {yearly
              ? `Just ${formatUsd(Math.round((PRO_PRICING.yearly / 12) * 100) / 100)} a month, billed yearly`
              : "Billed monthly, cancel any time"}
          </p>
          <ProCta planId={proPlanId} period={period} />
          <FeatureList items={proFeatures} />
        </section>
      </div>
    </div>
  );
}
