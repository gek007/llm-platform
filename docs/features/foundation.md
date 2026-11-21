# Foundation

## What was built

- **Packages (one install):** `@clerk/nextjs` 7.10, `react-markdown` + `remark-gfm` + `rehype-highlight` (highlight.js, synchronous, so `LessonMarkdown` works on the server and in client components such as the admin live preview; `shiki` is async and would force RSC-only use), `motion` (landing animation), `@mux/mux-player-react` + `@mux/mux-uploader-react` (player and direct-upload UI; chosen over Video.js 10 because the uploader has a React component with progress/error states and Mux Player is a single drop-in with Mux Data included; revisit Video.js if you want the newer player), `@mux/mux-node` (server calls from Convex actions), dev: `convex-test`, `@edge-runtime/vm`.
- **Clerk:** `<ClerkClientProvider>` (`src/components/providers/clerk-client-provider.tsx`, a `"use client"` wrapper around `<ClerkProvider>`; see ARCHITECTURE "Clerk provider and Cache Components") in the root layout (dark appearance in `src/lib/clerk-appearance.ts`), `src/proxy.ts` (Next 16 name for middleware; lives in `src/` because the app uses `src/`) with `clerkMiddleware` protecting `/dashboard(.*)` and `/admin(.*)` through a path regex (`createRouteMatcher` is deprecated in Clerk 7). It is an optimistic gate only: feature pages should also call `await auth.protect()` (and, with Cache Components, add a sibling `loading.tsx`). Sign-in/up at `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]`, each wrapped in `<Suspense>`.
- **Convex client:** `ConvexClientProvider` (`ConvexProviderWithClerk` + `useAuth`), calls `users.store` once per signed-in user, passing name, email and image from `useUser()`.
- **Convex backend:** `schema.ts`, `lib/auth.ts`, `lib/access.ts`, `courses`, `lessons`, `enrollments`, `progress`, `users`, `viewer`, `seed` (+ `lib/seedData.ts`). Pushed to `hallowed-iguana-534` and seeded: 4 published courses (2 free, 2 pro), 16 lessons, each with headings, a code block and a `quiz` block; first lesson of each pro course is a free preview.
- **Layout:** `SiteHeader` (client; reads admin from `user.publicMetadata.role`), `SiteFooter`, both mounted in the root layout. `siteConfig.name` is now "Learnly"; `siteConfig.tutor` and `siteConfig.nav` added; `public/tutor.svg` is the placeholder photo.
- **Markdown:** `LessonMarkdown({ source })`, `QuizBlock({ quiz })`, `CodeBlock`, `parseQuiz(json)` (in `src/components/markdown/quiz.ts`; returns `{ ok: true, quiz } | { ok: false, error }`, never throws), plus `src/components/ui/radio.tsx` (UI SDK radio wrapper).
- **Design tokens** ("Ink & Ember", dark-only) in `globals.css`: Tailwind utilities `bg-bg bg-surface bg-surface-2 bg-surface-3 border-line text-fg text-muted text-subtle bg-accent text-accent-fg text-accent-soft text-iris text-success text-danger`, `font-display` (Fraunces), `font-sans` (Geist), `font-mono`, `rounded-sm..xl`, `shadow-soft/lift/glow`, `.text-ember` gradient text, `.prose-lesson` markdown typography, `animate-float`. `@custom-variant dark (&)` makes old `dark:` classes always apply. `ui/button`, `ui/input`, `ui/accordion` were restyled with tokens.

## Claims

- Admin: custom session claim `metadata` = `{{user.public_metadata}}` (set on the dev instance). Next.js: `sessionClaims.metadata.role === "admin"`. Convex: `identity.metadata.role === "admin"`.
- Plan: Clerk session token v2 claim **`pla`**, format `u:<slug>` for user plans (`u:pro`, `u:free_user`; `o:` for org). Features are in **`fea`** (`u:feature,...`). Next.js: `has({ plan: "pro" })`. Convex: `identity.pla`.
- The existing instance had no `session` config, so nothing was overwritten. `aud: "convex"` comes from the Convex integration, not from `session.claims`; `scripts/check-dev-tooling.sh --online` still passes, but no live token was decoded after the change (see manual steps).

## isPro

`convex/lib/auth.ts#isPro(ctx)`: true if `identity.pla` contains `u:pro`, else true if the `users` row has `plan === "pro"` (fallback, only meaningful if a billing webhook is added later; none exists). `viewer.get().isPro` is the plan only; admins are `isAdmin` and `canAccessLesson` treats them as everything-allowed.

## Deviations from the contract

- `users.store` accepts optional `{ name, email, imageUrl }` (the default token has no name or email); callable with no args.
- Annual price: Clerk stores the annual price as a monthly equivalent in cents. 10 x $19 = $190/yr is $15.8333/month, so `annual_monthly_amount` is 1583 (about $189.96/yr). Set it to 1584 (about $190.08) or fix it in the dashboard if exact $190 matters.
- `lessons.getForViewer` omits `body` and `muxPlaybackId` entirely when locked (does not return null values) and adds `hasVideo`. Mux upload/asset IDs are never returned to viewers. `prev`/`next` are `{ slug, title, locked } | null`.
- `courses.getBySlug` returns the course doc plus `lessons` (the outline).
- `src/test/setup.ts` now guards its DOM stubs so Convex tests can run in `edge-runtime` (`// @vitest-environment edge-runtime` at the top of the file).
- `src/app/page.test.tsx` heading expectation changed to "Learnly" because of the rename (landing agent owns the file afterwards).

## Billing (done via the Clerk MCP, dev instance only)

`billing.user_enabled = true`; plan `pro` ($19/month, annual via `annual_monthly_amount`), `free_user` was created automatically. Plan IDs for `CheckoutButton` (`planId="cplan_..."`) are shown in the Clerk dashboard (Billing, Plans); the config API does not return them. `CheckoutButton` is exported from `@clerk/nextjs/experimental`.

## Manual steps for the owner

1. Set your admin role: tell the coordinator your Clerk user ID/email so it can run `update_user_metadata` with `{"role":"admin"}`, or Clerk Dashboard, Users, your user, Public metadata: `{ "role": "admin" }`. Sign out and in (or wait 60 seconds) for the token to refresh.
2. Copy the `pro` plan ID from the dashboard for `CheckoutButton`.
3. Optionally decode a fresh session token once (`getToken()` in the browser console) to confirm `aud: "convex"`, `metadata` and `pla` are present.
4. Payments in dev use Clerk's shared development gateway; production needs Stripe (out of scope).

## Notes for feature agents

- Server-side gating lives in Convex; never trust `locked` computed client-side.
- Cache Components is on: pages that call `auth()` or `auth.protect()` need a `loading.tsx` or a `<Suspense>` boundary; client hooks like `usePathname` on dynamic routes need `<Suspense>`; avoid `new Date()` in static components.
- Convex tests: copy the setup in `convex/functions.test.ts` (`convexTest(schema, modules)` with the `import.meta.glob` list, `// @vitest-environment edge-runtime`, `t.withIdentity({ subject, issuer, pla, metadata })`).
