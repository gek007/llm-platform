# Landing and pricing

## What was built

- **`/` (landing):** `src/app/page.tsx` composes server components inside `<main className="relative isolate flex-1 overflow-x-clip">`; client components live only at the leaves (`KnowledgeGraphBackdrop`, `Reveal`, `HeroDemo`).
  - `src/components/landing/knowledge-graph-backdrop.tsx` + `knowledge-graph-model.ts`: decorative (`aria-hidden`, `pointer-events-none`) full-viewport `<canvas>` fixed behind all landing sections (`-z-10`). Renders a deterministic curriculum knowledge graph — curved learning tracks, prerequisite bridges, lesson nodes, scroll-reactive mastery milestone rings, AI tutor hubs, and traveling ember/iris/emerald pulses — with subtle desktop pointer glow, `visibilitychange` pausing, mobile density scaling, and a single static frame with no `requestAnimationFrame` loop under `prefers-reduced-motion`.
  - `src/components/landing/hero-demo.tsx` + `hero-video.tsx`: animated lesson preview (video scrubber, code typing in, quiz answered, progress ring filling, AI tutor bubble) whose video window is a click-to-play Mux preview (`HeroVideo`). Before click it renders a Mux poster facade (`image.mux.com/<playbackId>/thumbnail.webp`) and accessible play trigger; on click it mounts `@mux/mux-player-react/lazy` with the dedicated public hero Mux asset (`learnly-hero-preview`, 8 s, `siteConfig.heroVideo.playbackId`, optional `NEXT_PUBLIC_HERO_MUX_PLAYBACK_ID` override). Non-interactive decorative panels remain `aria-hidden="true"`. With `prefers-reduced-motion` it renders the finished state with no timers or transitions (`useReducedMotion` from `motion/react`).
  - `reveal.tsx`: scroll reveal (`whileInView`, once); plain div under reduced motion.
  - `course-catalog.tsx`: async server component, `fetchQuery(api.courses.listPublished)` inside `<Suspense>` with a skeleton; falls back to a message if Convex fails. `course-card.tsx`: tier badge, level, lesson count, duration, link to `/courses/[slug]`.
  - `features-section.tsx`, `tutor-section.tsx` (`siteConfig.tutor` bio plus an AI tutor chat mock), `pricing-teaser.tsx`, `final-cta.tsx`.
  - The page is auth-free, so the shell stays static.
- **`/pricing`:** `src/app/pricing/page.tsx`.
  - `src/components/pricing/pricing-config.ts`: single price constant (`PRO_PRICING`: $19 monthly, $190 yearly), Clerk period mapping (`monthly` to `month`, `yearly` to `annual`), feature lists.
  - `pricing-plans.tsx` (client): UI SDK `SegmentedControl` toggle (default Yearly), Free and Pro cards, `ProCta`.
  - `pricing-faq.tsx`: accordion wrapper.
- **ProCta states:** no plan ID, disabled button plus a dev note; loading, disabled; signed out, `SignInButton` (`forceRedirectUrl="/pricing"`); Pro (`useAuth().has({ plan: "pro" })`), "You're on Pro" plus "Manage subscription" (`useClerk().openUserProfile()`, whose billing tab shows when Billing is on); otherwise Clerk `CheckoutButton` (`planId`, `planPeriod`, `for="user"`, redirect to `/dashboard`).

## How the plan ID is resolved

`src/components/pricing/pro-plan-id.ts#getProPlanId()`:
1. `NEXT_PUBLIC_CLERK_PRO_PLAN_ID` if set (added empty to `.env.example`).
2. Otherwise `clerkClient().billing.getPlanList({ payerType: "user" })`, picking slug `pro` (cached with `"use cache"` and `cacheLife("hours")`).
3. On failure or no match it returns `null` and the UI shows the disabled button with a dev message.

`.env.local` was not touched; step 2 needs only `CLERK_SECRET_KEY`, which already exists.

## Coordinator

- No new packages and no new required env vars.
- `e2e/learnly.spec.ts` ("navigating to Learnly renders the chat UI") clicks an "Open Learnly" link on `/`. The new landing page has no such link (the tutor widget is the entry point), so that test needs to go to `/learnly` directly.
- `src/components/course/dashboard-courses.tsx` (course agent) imports `CourseCardData` from the landing `course-card.tsx` and fails typecheck, since `durationMinutes` is missing. Pick a shared type or have the course agent define its own.
- Other typecheck and lint errors seen (not mine): `src/components/admin/use-admin-query.ts`, `src/components/tutor/tutor-chat*.tsx`.
- Not run (per brief): Playwright and `npm run build`. The pricing e2e assumes the sign-in button routes to a URL containing `sign-in`.

## Tests

`npx vitest run src/app/page.test.tsx src/components/landing src/components/pricing`: 6 files, 21 tests. E2E: `e2e/landing.spec.ts` (6), `e2e/pricing.spec.ts` (4).
