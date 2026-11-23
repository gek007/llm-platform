# LMS Platform — Architecture

Living document. Update it whenever a step changes the stack, structure, or tooling.

## Status

| Step | Scope | State | Commit |
| ---- | ----- | ----- | ------ |
| 0 | Local AI/dev tooling (MCP servers, CLIs, skills) for Clerk, Convex and UI SDK; Hostinger at first, replaced by Vercel in step 4 | Done | `1dc0684` |
| 1 | Next.js app scaffold, UI SDK packages, Vitest + Playwright | Done | `1dc0684` |
| 2 | Source folder structure, styled UI SDK wrappers, typed course mock data | Done | `1dc0684` |
| 3 | Clerk ↔ Convex backend integration (Convex accepts Clerk session tokens) | Done | `1dc0684` |
| 4 | Hosting on Vercel: project, Git deploys, env vars, region; `dev:convex` and `dev:all` scripts | Done | `d5f362c` |
| 5 | Mux dev tooling (MCP server, CLI, `mux-video` skill, access token on Convex) and the `modern-web-guidance` skill | Done | `1690b0d` |
| 6 | `eve` agent skill | Done | `ef228e8` |
| 7 | First `eve` agent (`Learnly` in `agents/learnly/`), `withEve` Next.js integration, `/learnly` chat UI with UI SDK wrappers, unit + E2E tests | Done | `3d802b1` |
| 8 | LMS features ([design](superpowers/specs/2026-11-21-lms-features-design.md)): Clerk + Convex in the app, schema and seed, landing and custom pricing (Clerk Billing), course catalog, lesson player (Mux, markdown, quizzes, progress), dashboard, admin panel with Mux uploads, Pro-only AI tutor widget with Clerk-verified auth | Done | `3d802b1` |
| 9 | Full-page LMS knowledge-graph backdrop on `/`, clickable Mux preview video in `HeroDemo`, custom signed Mux videos for TypeScript Foundations lessons 1–2, Vercel Production deployment | Done | `e507a09` |
| 10 | Hands-on labs POC on E2B ([design](superpowers/specs/2026-11-23-labs-poc-design.md)): lab image with terminal (ttyd) and VS Code (code-server), `LabProvider` (E2B, Docker, fake), lab sessions and exercise checks in Convex, lab page | Planned | — |
| 11 | Course engine demo ([design](superpowers/specs/2026-11-23-course-engine-design.md)): `course-builder` eve agent generates a course from a topic and resources (URL, PDF, YouTube embed, text) in English, Hebrew or Russian; chapters/subchapters, slide decks, practice quizzes, recorded chapter tests, sources; outline approval, live progress, admin review and results | In progress (learner side and admin generation UI done: chapters, decks, tests, completion, wizard, live view, outline editor, engine API, fake engine; `course-builder` agent scaffold with `jwtHmac` channel, typed engine client and live dispatch; research tools with SSRF-safe fetch; chapter-writer subagent; parallel write fan-out (`write_course`), `finish_job`, `regenerate`, tiny-course eval against a fake engine; admin review UI: chapters panel, deck and test editors, regenerate dialog, results table) | — |

Production (<https://llm-platform-xi.vercel.app>) runs the full Learnly LMS app (backed by the Clerk dev instance and Convex dev deployment `hallowed-iguana-534` until a custom domain and Convex prod deploy key are configured). Each area has a reference page in `docs/features/`:

| Area | Doc | Owns |
| ---- | --- | ---- |
| Foundation | [foundation.md](features/foundation.md) | Providers, `src/proxy.ts`, Convex schema/API/seed, claims, header/footer, markdown + quiz renderer, theme |
| Landing and pricing | [landing.md](features/landing.md) | `/`, `/pricing`, Pro plan ID lookup, `CheckoutButton` states |
| Courses | [course.md](features/course.md) | `/courses`, `/courses/[slug]`, lesson player, `/dashboard` |
| Course engine | [course-engine.md](features/course-engine.md) | Chaptered courses: chapter page, slide deck, chapter tests, completion rule, RTL, `digital-safety-basics` seed; admin generation (wizard, live view, outline approval, engine API, watchdog) |
| Admin | [admin.md](features/admin.md) | `/admin/**`, `convex/admin.ts`, Mux upload/sync/webhook |
| AI tutor | [tutor.md](features/tutor.md) | `agents/learnly/`, `src/components/tutor/`, Clerk auth on the agent channel |

### Access model

- **Admin:** Clerk `publicMetadata.role = "admin"`, copied into the session token by the custom claim `metadata: {{user.public_metadata}}`. Next.js reads `sessionClaims.metadata.role`; Convex reads `identity.metadata.role` (`convex/lib/auth.ts#isAdmin`).
- **Pro:** Clerk Billing plan `pro` ($19/month; annual stored as a monthly equivalent of $15.83). Next.js uses `has({ plan: "pro" })`; Convex reads the session token's `pla` claim (`u:pro`) in `isPro`, with `users.plan` as an unused fallback for a future billing webhook.
- **Lessons:** `convex/lib/access.ts#canAccessLesson` decides; Convex leaves out `body` for locked lessons and never sends `muxPlaybackId` to clients (`getForViewer` returns only `hasVideo`). **Video is signed:** assets use `playback_policies: ["signed"]` (free previews included), and `playback.getLessonTokens({ lessonId })` (`convex/playback.ts`, "use node") re-runs the access check with the caller's identity (`playbackData.resolveLessonPlayback` -> `access.ts#playbackIdForViewer`: `canAccessLesson`, draft courses admin-only, video must be `ready`), then signs RS256 playback/thumbnail/storyboard JWTs valid for 2 hours. It returns `null` otherwise, so a copied playback ID is useless; toggling `isFreePreview` takes effect on the next token request. Admins pass the check, so the admin preview uses the same action. Free course → signed-in users; free-preview lesson → anyone; Pro course → Pro or admin.
- **Tutor:** the browser sends the Clerk session token; the eve channel verifies it (`verifyToken`, `authorizedParties`) and requires Pro or admin; tools call Convex with that same token, so Convex enforces access again.

### Clerk provider and Cache Components

`src/app/layout.tsx` renders `ClerkClientProvider` (`src/components/providers/clerk-client-provider.tsx`), a `"use client"` wrapper around `<ClerkProvider>`, instead of `<ClerkProvider>` directly. In a Server Component, `ClerkProvider` is an async server wrapper (it awaits a keyless-mode check). On partially prerendered routes with dynamic params (`/courses/[slug]`, the lesson page) the PPR resume then failed with `Expected the resume to render <ReactClerkProvider> in this slot but instead it rendered <ClerkProvider>` and React fell back to client rendering (browser error #419). The app uses neither keyless mode nor Clerk's `dynamic` prop, so the client provider is equivalent. `e2e/courses.spec.ts` fails if those pages log a console error again.

### Open items

- **Owner setup:** set your own Clerk user's `publicMetadata.role` to `"admin"` (dashboard, or the Clerk MCP `update_user_metadata`), and replace the placeholder tutor bio, photo and links in `siteConfig.tutor` (`src/config/site.ts`).
- **Mux webhook (optional):** create it in the Mux Development environment pointing at `<NEXT_PUBLIC_CONVEX_SITE_URL>/mux/webhook` and run `npx convex env set MUX_WEBHOOK_SECRET …`. Without a secret the webhook returns 503 (fail closed) and video status syncs by polling instead. See [admin.md](features/admin.md).
- **Not verified with a live account:** the `pla` claim name and that `aud: "convex"` survived the claims change (no live token was decoded), real checkout, and signed-in/admin/Pro flows (e2e only covers signed-out flows; a Clerk testing-token setup would add them).
- **Billing in production:** Clerk Billing needs a production instance (custom domain) and Stripe. The tutor needs `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CONVEX_URL` and `TUTOR_AUTHORIZED_PARTIES` (or `NEXT_PUBLIC_APP_URL`) in the agent's environment.
- **Follow-ups:** per-page `<title>`s for course and lesson pages (they load client-side and use the default title).
- **Learnly model:** Claude Opus 5.5 called directly through the Anthropic API (`anthropic("claude-opus-5-5")` from `eve/models/anthropic`, `reasoning: "medium"`), not AI Gateway. It reads `ANTHROPIC_API_KEY` from `.env.local` locally and from Vercel's Production environment. Anthropic's server-side refusal fallbacks aren't enabled: eve's provider layer doesn't expose that request parameter.
- **Production cutover:** Vercel's Production environment currently points to the dev Clerk instance and Convex dev deployment (`hallowed-iguana-534`) so the app runs live on `*.vercel.app`. Switching to true prod backends needs a custom domain for Clerk Production and a Convex production deploy key (`tremendous-firefly-113`). See Hosting on Vercel.
- **Cleanup:** revoke the unused first Mux access token (ID `d6bafe66-…`) in the Mux dashboard.

## Stack

| Layer | Choice | Version |
| ----- | ------ | ------- |
| Framework | Next.js, App Router, `src/` directory, Turbopack | 16.4.6 |
| UI runtime | React | 19.3.0 |
| Language | TypeScript (strict), import alias `@/*` → `src/*` | 5.9 |
| Styling | Tailwind CSS v4 (`@layer ui-sdk;` declared first in `globals.css`) | 4.3.3 |
| Components | `@ui-sdk/core` + `@ui-sdk/react` (beta, pinned exact) | 0.1.0-beta.13 |
| Backend SDK + CLI | `convex` (schema, queries/mutations/actions, HTTP webhook) | 1.51.0 |
| Auth SDK | `@clerk/nextjs` (`CheckoutButton` from `@clerk/nextjs/experimental`) | 7.10 |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` (sync, works on server and client) | — |
| Animation | `motion` (landing page; respects `prefers-reduced-motion`) | — |
| Video | `@mux/mux-player-react`, `@mux/mux-uploader-react`, `@mux/mux-node` (Convex actions) | — |
| Agent SDK + CLI | `eve` + `ai` + `zod` (workspace agent `agents/learnly/`, proxied via `withEve` in `next.config.ts`) | eve 1.3.0 |
| Unit/component tests | Vitest + jsdom + Testing Library + jest-dom; `convex-test` + `@edge-runtime/vm` for Convex | Vitest 5.1 |
| End-to-end tests | Playwright (Chromium) against `next build && next start` | 1.65 |
| Lint | ESLint 9 with `eslint-config-next` | — |
| Package manager | npm | — |
| Dev process runner | `concurrently` (`npm run dev:all`) | 10.0 |

`next.config.ts` enables Cache Components (`cacheComponents: true`) and partial prefetching, as scaffolded by create-next-app 16.4. Version-matched Next.js docs ship in `node_modules/next/dist/docs/`; read them before writing Next.js code.

UI SDK components can render from server components (their modules already declare `"use client"`). Own components need `"use client"` when they hold state, effects or event handlers, or call `createParts`. Style them through `data-slot` and state attributes (e.g. Tailwind `group-data-open:`); no `web.css` default theme is used.

## Services

| Concern | Service | Role |
| ------- | ------- | ---- |
| Frontend | [Next.js](https://nextjs.org/docs) | Routing, server rendering, layouts |
| Authentication | [Clerk](https://clerk.com/docs) | Sign-in/up, users, organizations, roles |
| Backend & database | [Convex](https://docs.convex.dev) | Schema, queries/mutations/actions, realtime sync, file storage, crons |
| Hosting | [Vercel](https://vercel.com/docs) | Builds from GitHub, preview and production deployments, CDN, Vercel Functions (server rendering, route handlers) |
| Video | [Mux](https://www.mux.com/docs) | Lesson video: direct uploads from the admin panel, encoding, streaming playback in the lesson player |
| AI agents | [eve](https://github.com/vercel/eve) | Durable backend AI agents (`agents/learnly/` -> `/eve/learnly/v1/*`) with Claude Opus 5.5 via the Anthropic API, durable via Workflow |
| UI behaviors | [UI SDK](https://ui-sdk.dev/docs) (beta) | Accessible behaviors (focus, keyboard, selection, popups, drag and drop, ARIA) via `@ui-sdk/core` + framework adapter |

Clerk is the only auth provider; Convex validates Clerk-issued session tokens (see Clerk ↔ Convex auth). Convex Auth is intentionally not used.

### Clerk ↔ Convex auth

Follows Clerk's [Convex integration guide](https://clerk.com/docs/guides/development/integrations/databases/convex). No JWT template is used.

1. **Clerk:** the Convex integration is activated for the instance (Dashboard → [Integrations → Convex](https://dashboard.clerk.com/apps/setup/convex)). It adds `aud: "convex"` to every session token. Tokens are RS256, issued by the Frontend API URL, and expire after 60 seconds; the Clerk SDK refreshes them.
2. **Convex:** `convex/auth.config.ts` trusts one provider: `domain` is `CLERK_FRONTEND_API_URL` from the deployment env, and `applicationID: "convex"` must equal the token's `aud`. Convex fetches the signing keys from `<domain>/.well-known/jwks.json`.
3. **Inside Convex functions:** `ctx.auth.getUserIdentity()` returns `null` for anonymous calls. For a signed-in user it returns `subject` (the Clerk user ID, `user_…`), `issuer` and `tokenIdentifier` (`<issuer>|<subject>`). An invalid or expired token fails the call with `Unauthenticated`.
4. **Next.js:** `<ClerkProvider>` wraps a `"use client"` `ConvexProviderWithClerk` (`convex/react-clerk`) that receives `useAuth` from `@clerk/nextjs`. Components read the auth state with `useConvexAuth()` or `<Authenticated>`/`<Unauthenticated>` from `convex/react`, not with Clerk's hooks. That way they wait until Convex has validated the token.

Verified on 2026-11-21 against the dev deployment. A throwaway Clerk test user got a session token with `aud: "convex"` and `iss: https://pro-giraffe-8779.clerk.accounts.dev`. A temporary Convex query called with that token returned the user's identity; without a token it returned `null`; with a tampered signature it was rejected. The test user and the query were deleted afterwards. `scripts/check-dev-tooling.sh --online` repeats the configuration part of this check.

Production needs a Clerk production instance first. Then run `npx convex env --prod set CLERK_FRONTEND_API_URL https://clerk.<domain>` and `npx convex deploy`.

### Hosting on Vercel

| Setting | Value |
| ------- | ----- |
| Project | `llm-platform` (`prj_Lo02cytC82SkZ7CwHaGTcYmo2MlJ`) in the Hobby scope "gek007's projects" |
| Git | Connected to [gek007/llm-platform](https://github.com/gek007/llm-platform). A push to `main` deploys to production; other branches and pull requests get preview deployments |
| Production URL | <https://llm-platform-xi.vercel.app> (also `llm-platform-gek007s-projects.vercel.app`) |
| Build | Next.js preset: `npm install`, `npm run build`; Node.js 26.x |
| Function region | `dub1` (Dublin), set in `vercel.json`, next to the Convex deployments in eu-west-1. Hobby allows one region |
| Deployment protection | Vercel's default: preview and per-deployment URLs need a Vercel login; the production domains are public |

Environment variables on Vercel (`vercel env ls`):

| Key | Preview, Development | Production |
| --- | -------------------- | ---------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dev instance | Clerk dev instance (until custom domain) |
| `CLERK_SECRET_KEY` | Clerk dev instance (Secret on Preview; Vercel allows no Secrets on Development) | Clerk dev instance (Secret) |
| `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex dev deployment `hallowed-iguana-534` | Convex dev deployment `hallowed-iguana-534` (until prod cutover) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (Secret) |
| `TUTOR_AUTHORIZED_PARTIES` | — | `https://llm-platform-xi.vercel.app,https://llm-platform-gek007s-projects.vercel.app` |

`CONVEX_DEPLOYMENT` stays local: only the Convex CLI reads it. Switching Production from the dev backends to dedicated prod backends waits for two decisions:

- **Clerk:** a production instance requires a custom domain (it can't run on `*.vercel.app`). Until then, production runs on the dev instance.
- **Convex:** the production build should run `npx convex deploy --cmd 'npm run build'` with a production `CONVEX_DEPLOY_KEY` on Vercel. That pushes `convex/` to `tremendous-firefly-113` and sets `NEXT_PUBLIC_CONVEX_URL` for the build. The prod deployment then also needs `CLERK_FRONTEND_API_URL`.

Deployments normally come from Git pushes. `vercel deploy` from this folder creates a preview deployment from the working tree, or a production one with `--prod`. `.vercelignore` keeps CLI uploads to what's in Git; Vercel never uploads `.env.local`, `.vercel/`, `.next/` or `node_modules/`.

### Merging and deploying course-engine

The `feat/course-engine` branch changes both `convex/` and the Next.js app, and a Git push deploys only the app. So:

1. **Push `convex/` before (or together with) `main`.** Before, or at the same time as, pushing `main` to GitHub/Vercel, the owner pushes `convex/` to the Convex deployment production reads (today `hallowed-iguana-534`; `tremendous-firefly-113` after the prod cutover above). The schema change is additive (new tables, new optional fields), so existing documents stay valid. The lesson page tolerates a deployment that predates the branch (`LessonPlayer` defaults missing `sources` and `language`), but the chapter, test, admin and generator pages need the new functions.
2. **Seeding is optional.** `npx convex run seed:run` is idempotent; it adds and publishes the free Hebrew demo course `digital-safety-basics` with its chapters, decks and tests.
3. **Engine secrets only where the engine should run.** `COURSE_ENGINE_SECRET` (Convex deployment and app environment) and `COURSE_BUILDER_CHANNEL_SECRET` / `COURSE_BUILDER_URL` / `COURSE_ENGINE_MODE` (app environment) are needed only if course generation should run against that deployment. Without them the rest of the site works and `/engine/*` fails closed.
4. **e2e on `main`.** `npm run test:e2e` on `main` needs the deployment in `.env.local` pushed and seeded: `e2e/chapters.spec.ts` opens `digital-safety-basics`.

## Environment

| Resource | Name / ID | Dashboard |
| -------- | --------- | --------- |
| Git repository | [gek007/llm-platform](https://github.com/gek007/llm-platform) (public), branch `main` | [github.com](https://github.com/gek007/llm-platform) |
| Clerk application | "LMS Platform" `app_3MQ6Ah3aicMxqGdRvLxQwJi2ljf` (development instance) | [dashboard.clerk.com](https://dashboard.clerk.com) |
| Convex project | `kostya-shilkrot/llm-platform`: dev deployment `hallowed-iguana-534`, prod deployment `tremendous-firefly-113` (both eu-west-1; prod is empty and read-only to the MCP server) | [dashboard.convex.dev](https://dashboard.convex.dev/t/kostya-shilkrot/llm-platform) |
| Mux environment | `LMS-Platform` (type development) in the `aicy` organization; 3 ready 720p assets (`learnly-hero-preview` public on `/`, `learnly-lesson:why-types` and `learnly-lesson:basic-types` signed); one signing key. The Mux MCP and the `mux` CLI (OAuth, environment `aicy-lms-platform`) are both signed in to it | [dashboard.mux.com](https://dashboard.mux.com) |
| Vercel project | `llm-platform` in "gek007's projects" (see Hosting on Vercel) | [vercel.com/gek007s-projects/llm-platform](https://vercel.com/gek007s-projects/llm-platform) |

`.env.local` (git-ignored, mode 600):

| Key | Used by | Source |
| --- | ------- | ------ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Next.js (browser + server) | `clerk env pull --file .env.local` |
| `CLERK_SECRET_KEY` | Next.js server only | `clerk env pull --file .env.local` |
| `CONVEX_DEPLOYMENT` | Convex CLI (`npx convex dev`, MCP server) | `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_URL` | `ConvexReactClient` / server fetches | `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex HTTP actions (e.g. webhooks) | `npx convex dev` |
| `COURSE_ENGINE_SECRET` | Bearer secret for the Convex HTTP `/engine/*` surface; the same value is on the Convex deployment and read by the Next.js routes/engine. Generated with `openssl rand -hex 32`, never printed |
| `COURSE_ENGINE_MODE` | `fake` or `live` (default `live`): fake runs the canned engine instead of the `course-builder` agent |
| `COURSE_BUILDER_CHANNEL_SECRET` | HS256 key for Next.js -> `course-builder` agent JWTs (`src/lib/course-builder/eve-client.ts` signs, `agents/course-builder/agent/channels/eve.ts` verifies). Generated with `openssl rand -hex 32`, never printed |
| `COURSE_BUILDER_URL` | Optional. Base URL of the agent's `/v1/*` routes for live dispatch; default `http://127.0.0.1:2001/eve` (`npm run dev:course-builder`) |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | Local copy of the Mux access token kept on the Convex deployment (server only) | Mux Dashboard → Settings → Access Tokens |
| `VERCEL_OIDC_TOKEN` | Vercel services called from local code (unused so far); expires after about 12 hours | `vercel link`, refreshed by `vercel env pull` |

Convex deployment env vars (`npx convex env list`), read by Convex functions:

| Key | Value |
| --- | ----- |
| `CLERK_FRONTEND_API_URL` | Clerk Frontend API URL of the dev instance (`https://pro-giraffe-8779.clerk.accounts.dev`), read by `convex/auth.config.ts`. Clerk's guide uses this name; Convex's older docs call it `CLERK_JWT_ISSUER_DOMAIN`. |
| `COURSE_ENGINE_SECRET` | Authenticates `POST /engine/*` HTTP actions (`convex/lib/engineAuth.ts`); fails closed when unset |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` | Mux signing key of the `LMS-Platform` development environment (private key base64, as Mux returns it), used by `convex/playback.ts` to sign playback tokens. Set only on the Convex deployment (piped into `npx convex env set`); never in `.env.local`, files or Vercel. Production needs its own key in the production Mux environment |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | Mux access token for the `LMS-Platform` development environment (Video, Data, Robots and System, read and write), for server-side Mux calls from Convex actions. Used by `convex/mux.ts` (uploads, sync, removal). The same pair is in `.env.local`; it never goes into `NEXT_PUBLIC_*` variables or Vercel unless a Next.js route handler calls Mux |

Setting up a new machine: `clerk auth login && clerk link --app app_3MQ6Ah3aicMxqGdRvLxQwJi2ljf && clerk env pull --file .env.local`, then `npx convex dev` (select the existing `llm-platform` project), then `vercel login && vercel link --project llm-platform --scope gek007s-projects`. `scripts/check-dev-tooling.sh` fails if `.env.local` is missing a key listed in `.env.example` or the folder isn't linked to the Vercel project.

Daily development runs three processes, started together by `npm run dev:all`:

- `npm run dev`: Next.js on port 3000 (or `PORT`).
- `npm run dev:convex` (`convex dev`): watches `convex/`, typechecks it, regenerates `convex/_generated/` and pushes functions, schema and `auth.config.ts` to the dev deployment on every save. Add `-- --once` to push once and exit.
- `npm run dev:course-builder` (`EVE_DEV_STATE_DIR=.eve-dispatch eve dev --agent course-builder --resume --no-ui --port 2001`): the course engine agent. `--resume` keeps job sessions alive across restarts; port 2001 leaves 2000 to `npm run dev:learnly`. Live dispatch calls it at `COURSE_BUILDER_URL` (default `http://127.0.0.1:2001/eve`). `next dev` (via `withEve`) also starts its own copy of every workspace agent for the `/eve/<name>/v1/*` proxy; the route doesn't use that copy. The two copies would otherwise share `agents/course-builder/.eve/` (dev-server state, runtime snapshots, local workflow data), and eve refuses a second flagged dev server there ("A dev server is already running for this eve agent"), so this one keeps its dev state in the git-ignored `agents/course-builder/.eve-dispatch/`.

`dev:all` uses `concurrently`, which prefixes each output line with `[next]`, `[convex]` or `[course-builder]`. If any process exits, it stops the others, and Ctrl+C stops all. Clerk, Vercel and Mux are hosted services, so nothing runs locally for them. Next.js allows only one dev server per project folder, so stop any running `npm run dev` before starting `dev:all`.

Production credentials (a Clerk production instance, a Convex prod deploy key, a Mux production token) are not created yet. They go into the service that reads them (Vercel's Production environment variables or the Convex prod deployment), never into files.

### Workflow

Each step ships with unit tests and end-to-end tests, a pass of `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e`, and a check of the changed screens through the Playwright MCP. This document is updated in the same step. After the owner reviews the step, the changes are committed and pushed to `main`; the push deploys to production on Vercel.

### Agent deployments (Convex agent mode)

Coding agents never push to the owner's personal dev deployment (`hallowed-iguana-534`): the owner develops and tests against it, and an agent's half-finished schema or functions would land there mid-session. Following Convex's [agent mode](https://docs.convex.dev/cli/agent-mode), each agent that changes `convex/` works in its own git worktree with its own cloud dev deployment:

```bash
git worktree add ../llm-platform-<task> -b <task>    # or the agent tool's worktree isolation
cd ../llm-platform-<task>
scripts/agent-deployment.sh                          # --expiration "in 1 day" to shorten
```

`scripts/agent-deployment.sh`:

1. copies the non-Convex keys (Clerk, Mux) from the main checkout's `.env.local` into the worktree's `.env.local` (mode 600) and runs `npm ci` if `node_modules` is missing;
2. creates and selects the dev deployment `kostya-shilkrot:llm-platform:dev/agent-<worktree>`, expiring in 5 days by default (`npx convex deployment create … --type dev --select --expiration`), which writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_*` for the worktree;
3. copies the deployment env vars (`CLERK_FRONTEND_API_URL`, `MUX_TOKEN_*`, `MUX_SIGNING_*`) from the owner's dev deployment through a mode-600 temp file, never printing them. Convex's recommended alternative, project-level default env vars, can only be set in the dashboard;
4. saves a deploy key scoped to that deployment as `CONVEX_DEPLOY_KEY` (`npx convex deployment token create … --save-env`). With it set, the worktree's `npx convex` commands can only reach that deployment; `--deployment` and `--prod` are refused;
5. pushes the functions once and runs `seed:run`.

The script refuses to run in the main checkout (it would repoint the owner's `.env.local`) and does nothing once `CONVEX_DEPLOY_KEY` is set. Verified on 2026-11-21: a test worktree got `abundant-peccary-321` with all five env vars and the 4 seeded courses, while the main checkout stayed on `hallowed-iguana-534`. The CLI can't delete deployments; agent deployments expire on their own, or delete them in the dashboard. Remove the worktree with `git worktree remove <path>` when the branch is merged.

Notes:

- Agent deployments use the Clerk dev instance, so signing in to an agent worktree's app works with the same accounts. The Mux webhook isn't configured for them; video status syncs by polling.
- Running Next.js in a worktree is fine alongside the owner's dev server: `next dev` writes to `.next/dev`, and `npm run test:e2e` uses port 3100. Stop any server already on 3100 first, because Playwright reuses it outside CI.
- Convex's other agent-mode option, a local backend (`npx convex dev --once` in a non-interactive shell with no deployment configured), suits ephemeral cloud agents but not this project: it has no default env vars and no public URL for webhooks.
- Unit tests (`convex-test`) need no deployment at all.

Commits are authored as `gek007 <17905201+gek007@users.noreply.github.com>`, set in this repository's git config. Pushing needs `gek007` as the active GitHub CLI account (`gh auth switch --user gek007`), because the CLI also holds a second account without access to this repository.

## Repository layout

```
.agents/skills/               Agent skills (installed by `npx skills`, pinned in skills-lock.json)
.cursor/mcp.json              Project MCP servers: clerk, convex, vercel, mux
.env.example                  Every env key the app needs, without values (committed)
.env.local                    Real dev values (git-ignored; see Environment)
.vercel/                      Local link to the Vercel project, written by `vercel link` (git-ignored)
.vercelignore                 Files `vercel deploy` must not upload
AGENTS.md                     Agent instructions (Next.js block is managed by `next dev`)
README.md                     Quick start: install, dev, deploy and check commands
agents/                       eve agent workspace (each subfolder is a named agent)
  learnly/
    agent/
      agent.ts                Learnly model config (`claude-opus-5-5` via the Anthropic API, `defaultTools: false`)
      instructions.md         Learnly system prompt and AI disclosure
      channels/eve.ts         HTTP channel auth: Clerk session token, Pro or admin only (`lib/clerk-auth.ts`)
      lib/                    Clerk verification, viewer context, Convex client helpers
      tools/                  `list_courses`, `get_course_details`, `get_my_progress`, `get_lesson`, `show_quiz` + tests
    evals/                    Baseline eve evals (`evals.config.ts`, `smoke.eval.ts`)
  course-builder/             Course engine agent (`claude-opus-5-5`, `reasoning: "high"`, `defaultTools: false`)
    agent/
      agent.ts instructions.md   Model config; role, commands, phases, language, source integrity, quality bar
      channels/eve.ts         `jwtHmac` service auth only (`COURSE_BUILDER_CHANNEL_SECRET`, `sub: course-builder-route`); 401 for everything without the secret. Walk built by `lib/channel-auth.ts`, which adds `localDev()` only for the local server `eve eval` starts (`EVE_EVALUATION=1` and `EVE_EVALUATION_RUN_ID` set; never set `EVE_EVALUATION` in `.env.local`)
      lib/engine-client.ts    Typed `/engine/*` client (`createEngineClient`, `engineFromEnv`, `EngineError`), built on `src/lib/course-builder/engine-http.ts`
      lib/command.ts          Re-exports `parseCommand` from `src/lib/course-builder/commands.ts`
      lib/safe-fetch.ts       SSRF-safe fetch (`guarded-fetch`: https only, private/metadata IPs refused at connect time, 3 redirects, byte caps, Content-Type and `%PDF` checks)
      lib/report-progress.ts  `makeReportProgressTool`, shared by the root agent and the chapter-writer
      lib/                    Also `tool-result.ts` (EngineError → `{ ok: false, message }`), `outline.ts` (length-preset check), `youtube.ts` (oEmbed), `html-text.ts`
      tools/                  Research: `get_job`, `read_resource`, `youtube_info`, `web_search`/`web_fetch` (eve built-ins), `save_sources`, `save_outline`, `report_progress`; write: `write_course` and `regenerate` (workflow tools), `finish_job`, `fail_job` + tests
      lib/write-chapters.ts   The write fan-out shared by `write_course` and `regenerate`: `"use step"` engine calls (`loadJob`, `loadChapterContent`, `logProgress`), `runWriter` (one `ctx.agent("chapter-writer").send(...)`), `writeChapters` (`Promise.all`, one `chapter` event per writer, `{ chapters, failed }`), `missingFromRefusal`
      lib/regenerate.ts       The "Only redo <target>: <instruction>" / "Regenerate the chapter" sections and the chapter's saved content (`savedContentSection`) appended to a writer brief
      lib/writer-brief.ts     `buildWriterBrief(job, chapterOrder)` (the chapter-writer's message) and `writerOutputSchema` (its report)
      subagents/chapter-writer/  Writes one chapter (same model and effort, `tool: false`): `save_subchapter`, `save_deck`, `save_test`, `report_progress` (the root tool re-exported) + tests
    evals/                    `tiny-course.eval.ts` (1-chapter write end to end, costs tokens); `evals.config.ts` setup serves `lib/fake-engine.ts` (in-memory `/engine/*` with the real validators) and points `CONVEX_SITE_URL` at it
convex/                       Convex backend functions; convex/_generated/ is written by `npx convex dev`
  auth.config.ts              Trusts Clerk session tokens (see Clerk ↔ Convex auth)
  schema.ts                   Tables and indexes (see Data model)
  lib/                        auth.ts (identity, isAdmin, isPro), access.ts (canAccessLesson), seedData.ts
  courses.ts lessons.ts …     Public and student functions; admin.ts, mux.ts and playback.ts ("use node"), muxData.ts, playbackData.ts, http.ts for admin and video
  generation.ts engine.ts     Course engine: admin job API (create, resources, outline, approve, sources), engine read (`getJob`, `getChapterContent`) and write ops behind `/engine/*`
  crons.ts                    Watchdog: fails stalled generation jobs every 5 minutes
  lib/jobs.ts sourceScan.ts engineAuth.ts   Job transitions/events/outline validation, source-integrity scan, bearer check for `/engine/*`
  *.test.ts                   convex-test unit tests (never deployed: two dots in the name)
docs/ARCHITECTURE.md          This file
docs/features/                Reference page per feature area (see Status)
docs/superpowers/specs/       Design documents
e2e/                          Playwright end-to-end tests
eslint.config.mjs             ESLint config (ignores .agents/, convex/_generated/, test output)
next.config.ts                Next.js config (Cache Components, partial prefetching, Tailwind loader)
package.json                  Scripts: dev, dev:convex, dev:all, build, start, lint, typecheck, test, test:watch, test:e2e
public/                       Static assets
scripts/agent-deployment.sh   Gives an agent worktree its own Convex dev deployment and scoped deploy key (see Agent deployments)
scripts/check-dev-tooling.sh  Verifies CLIs, MCP config, skills, .env.local, Vercel link; --online adds MCP, Clerk ↔ Convex, Mux sign-in and Vercel env checks
src/
  app/                        App Router routes only: /, /pricing, /courses/** (incl. `/courses/[slug]/chapters/[chapterSlug]` and `.../test`), /dashboard, /admin/** (incl. `/admin/generate` wizard and `/admin/generate/[jobId]` live view), `/api/course-builder/[action]` (start, approve, regenerate, resume), /learnly, /sign-in, /sign-up
  proxy.ts                    clerkMiddleware; optimistic gate for /dashboard, /admin, /learnly (pages re-check)
  components/
    ui/                       App-styled UI SDK wrappers (one file per component, e.g. accordion.tsx)
    layout/                   Site header and footer
    providers/                ClerkClientProvider, ConvexClientProvider (stores the user on sign-in)
    chapter/                  ChapterPage/ChapterView, SlideDeck, Slide, ChapterTest (course engine)
    markdown/                 LessonMarkdown, CodeBlock, QuizBlock, parseQuiz
    landing/ pricing/         Landing sections, full-page LMS knowledge-graph backdrop, hero animation + Mux preview player, pricing plans, Pro plan ID lookup
    course/ lesson/ video/    Catalog, course detail, lesson player, Mux player wrapper, dashboard
    admin/                    Admin forms, lessons list, Mux video panel, course-engine review (chapters panel, deck and test editors, regenerate dialog, results table)
    generate/                 Course generation wizard, resource inputs, live view, outline editor, jobs list
    tutor/                    Floating AI tutor widget and chat
  config/                     Static app config (site.ts: name, description)
  hooks/                      Shared client hooks (`use-*.ts`, "use client")
  lib/
    utils.ts                  cn() and mergeClassName() for class composition
    clerk-appearance.ts       Clerk theme matching globals.css
  test/setup.ts               Vitest setup: jest-dom, jsdom stubs for ui-sdk, strict mode, cleanup
playwright.config.ts          E2E config; builds and starts the app on port 3100
vitest.config.mts             Unit test config (jsdom, tsconfig paths)
skills-lock.json              Exact source commit + hash of every installed skill
tsconfig.json                 TypeScript config (strict, `@/*` alias, excludes .agents/)
vercel.json                   Vercel project config (function region)
```

`.agents/` is excluded from `tsconfig.json` and ESLint because some skills ship template projects.

### Source conventions

- **Files:** kebab-case (`course-card.tsx`, `use-media-query.ts`); named exports everywhere except Next.js route files, which need default exports.
- **Imports:** use the `@/` alias across folders (`@/components/ui/accordion`), relative paths within a folder. No barrel `index.ts` files; import from the file that defines the thing.
- **Where code goes:** `app/` composes; it should not hold reusable components or data logic. Reusable UI goes in `components/`, domain logic and data access in `lib/<domain>/`, cross-cutting helpers in `lib/utils.ts`.
- **Server first:** components are Server Components unless they need state, effects, event handlers or browser APIs; then the file starts with `"use client"`. Keep client components small and push them to the leaves.
- **UI components:** pages import UI SDK parts through `@/components/ui/*`, which apply the app's Tailwind styles. Wrappers keep the UI SDK API (same part names and props), merge `className` with `mergeClassName` so string and state-function forms both work, and add only visual details (like the accordion chevron). Use UI SDK parts directly only for one-off cases.
- **Tests:** colocated next to the file (`queries.test.ts` beside `queries.ts`). This applies in `convex/` too: Convex skips files with more than one dot in the name, so `*.test.ts` files are never deployed.

## Data model

Defined in `convex/schema.ts`; seed data in `convex/lib/seedData.ts` (`npx convex run seed:run`, idempotent by slug: 4 courses, 16 lessons). User identity in Convex is the Clerk user ID (`identity.subject`).

| Table | Fields | Indexes |
| ----- | ------ | ------- |
| `users` | `clerkId`, `name`, `email?`, `imageUrl?`, `plan?` | `by_clerkId` |
| `courses` | `slug`, `title`, `summary`, `description` (markdown), `level`, `tier` (`free` \| `pro`), `status` (`draft` \| `published` \| `archived`), `tags`, `outcomes`, `coverImageUrl?`, `order`, `language?` (`en` \| `he` \| `ru`, default `en`), `generationJobId?` | `by_slug`, `by_status_order` |
| `lessons` | `courseId`, `slug`, `title`, `summary`, `body` (markdown), `order`, `durationMinutes`, `isFreePreview`, `muxUploadId?`, `muxAssetId?`, `muxPlaybackId?`, `videoStatus?`, `chapterId?`, `sourceIds?` | `by_course_order`, `by_course_slug`, `by_muxAssetId`, `by_muxUploadId` |
| `enrollments` | `userId`, `courseId`, `enrolledAt` | `by_user`, `by_user_course`, `by_course` |
| `lessonProgress` | `userId`, `courseId`, `lessonId`, `completedAt` | `by_user_course`, `by_user_lesson`, `by_course`, `by_lesson` |
| `chapters` | `courseId`, `slug`, `title`, `summary`, `order` | `by_course_order`, `by_course_slug` |
| `slideDecks` | `courseId`, `chapterId`, `slides[]`, `updatedAt` (one row per chapter) | `by_chapter` |
| `chapterTests` | `courseId`, `chapterId`, `version`, `passPercent`, `maxAttempts`, `questions[]` (one row per chapter; edits bump `version` in place) | `by_chapter`, `by_course` |
| `testAttempts` | `userId`, `courseId`, `testId`, `testVersion`, `answers`, `scorePercent`, `passed`, `submittedAt` | `by_user_test`, `by_test`, `by_user_course` |
| `courseResources` | `jobId`, `courseId?`, `kind`, `title`, `url?`, `storageId?`, `text?`, `origin` (`admin` \| `engine`), `readStatus` | `by_job`, `by_course` |
| `generationJobs` | `createdBy`, `topic`, `language`, `level`, `length`, `audience?`, `notes?`, `status`, `eveSessionId?`, `dispatchError?`, `outline?`, `courseId?`, `error?`, `usage?` | see `convex/schema.ts` |
| `generationEvents` | `jobId`, `at`, `kind`, `message`, `chapterOrder?` | `by_job_at` |
| `generationSources` | `jobId`, `url`, `title`, `kind`, `resourceId?`, `excerpt?` | `by_job`, `by_job_url` |

| Module | Functions |
| ------ | --------- |
| `courses` | `listPublished`, `getBySlug` (outline with `locked`, no bodies; `language` and `chapters` with `hasDeck`/`test`) |
| `lessons` | `getForViewer` (body and playback ID only when unlocked; `prev`/`next`; `language`, `chapter`, `sources`) |
| `chapters` | `getForViewer` (deck only when unlocked, lessons, test summary with best score and attempts, `prev`/`next`) |
| `enrollments` | `enroll` (`PRO_REQUIRED` error), `isEnrolled`, `listMine` |
| `progress` | `setComplete`, `forCourse` |
| `users`, `viewer` | `store` (upsert on sign-in), `get` (`signedIn`, `isAdmin`, `isPro`, `user`) |
| `playback` | `getLessonTokens` (action): signed Mux tokens after an access check; `null` when locked or no ready video |
| `admin`, `mux` | Admin-only CRUD, lesson reorder, cascading course delete, Mux direct upload, `syncLessonVideo`, `removeVideo` |
| `http` | `POST /mux/webhook` (signature-verified, fails closed without `MUX_WEBHOOK_SECRET`) |

Lesson markdown supports GFM, highlighted code blocks with a copy button, and quizzes as fenced `quiz` blocks with a JSON body (`{ "question", "options", "answer", "explanation" }`). Markdown headings render one level down (the page owns the `<h1>`), and the lesson player drops a leading heading that repeats the lesson title.

## Testing

| Command | What it runs |
| ------- | ------------ |
| `npm run typecheck` | `next typegen` (route types such as `LayoutProps`) then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest once (`src/**/*.test.{ts,tsx}`, `convex/**/*.test.ts`, `agents/**/*.test.ts`; 599 tests in 80 files); `npm run test:watch` for watch mode |
| `npm run test:e2e` | Playwright; builds Learnly, the course-builder agent and Next.js and starts a production server on `PORT` (default 3100); 24 tests, signed-out flows only. Outside CI it reuses a server already listening on that port, so stop any `next start` there first or you test a stale build |
| `npm run info:learnly` | Inspects eve discovery, tools, and diagnostics for `agents/learnly/` |
| `npm run eval:learnly` | Runs `agents/learnly/evals/` against a local Learnly server (needs live model credentials) |
| `npm run info:course-builder`, `npm run eval:course-builder` | The same for `agents/course-builder/`; its eval writes a 1-chapter course against an in-memory fake engine (real Opus calls, see [course-engine.md](features/course-engine.md#write-phase-and-regenerate-course-builder-agent) for cost) |
| `scripts/check-dev-tooling.sh [--online]` | Dev tooling and service configuration (see Repository layout) |

Conventions:

- Every interface built with UI SDK gets an agent test (`createAgent` from `@ui-sdk/react/agent`): every snapshot entry has a name, and an `act` step drives each control.
- `globalThis.__UI_SDK_STRICT__ = true` makes UI SDK development warnings fail tests.
- Things jsdom can't show (top-layer popups, layout, color contrast, hydration) are checked in Playwright and, during review, through the Playwright MCP.
- Async server components can't be unit-tested with Vitest; cover them with E2E tests.

## AI / developer tooling

### MCP servers (`.cursor/mcp.json`)

| Server | Transport | Auth | Notes |
| ------ | --------- | ---- | ----- |
| `clerk` | Remote HTTP `https://mcp.clerk.com/mcp` | OAuth in browser (Cursor → MCP → Authenticate) | Account tools (apps, users, orgs, domains) + SDK snippets |
| `convex` | Local stdio `npx -y convex@latest mcp start --project-dir ${workspaceFolder}` | Uses Convex CLI login / `.env.local` deployment | Dev deployment only; production access is off by default and must stay off |
| `vercel` | Remote HTTP `https://mcp.vercel.com` | OAuth in browser (Cursor shows "Needs login") | Docs search, projects, deployments, build logs, Web Analytics. Gets the same access as your Vercel account |
| `mux` | Remote HTTP `https://mcp.mux.com` | OAuth in browser: sign in to dashboard.mux.com and pick one Mux environment | "Code Mode": two tools, `search_docs` and `execute` (TypeScript against `@mux/ts`, run in a Mux-hosted sandbox). Can do anything the chosen environment allows, deletes included; authorize the Development environment, not Production |

### CLIs

| CLI | Installed | Install | Auth |
| --- | --------- | ------- | ---- |
| `clerk` | 4.4.0 | `npm i -g clerk` | `clerk auth login`; `clerk link --app app_3MQ6Ah3aicMxqGdRvLxQwJi2ljf` once per machine |
| `convex` | 1.51.0 | Project dependency (`npm i convex`), run via `npx convex` | `npx convex login` |
| `vercel` | 64.5.0 | `brew install vercel` (or `npm i -g vercel`) | `vercel login`; `vercel link` once per machine |
| `mux` | 4.0.0 | `brew tap muxinc/tap && brew install muxinc/tap/mux` (or `npm i -g @mux/cli`) | `mux login` (browser; stores credentials in `~/.config/mux/config.json`), or `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` |
| `gh` | 2.96.0 | `brew install gh` | `gh auth login`; `gek007` must be the active account to push |

### Skills (`.agents/skills/`)

54 skills, pinned in `skills-lock.json`. Cursor loads them automatically; invoke one manually with `/skill-name`.

- **Clerk** (`clerk/skills`, 17): `clerk` router, `clerk-cli`, `clerk-setup`, `clerk-custom-ui`, `clerk-backend-api`, `clerk-orgs`, `clerk-billing`, `clerk-testing`, `clerk-webhooks`, `clerk-migrate`, and web-framework patterns (Next.js, React, React Router, TanStack, Astro, Vue, Nuxt). Native mobile and Chrome-extension skills are excluded.
- **Convex** (`convex/agent-skills`, 31): all official skills except `convex-auth` (conflicts with Clerk) and `convex-improve-convex-plugin` (uploads session transcripts).
- **Vercel** (2): `deploy-to-vercel` (`vercel-labs/agent-skills`; preview unless production is asked for explicitly, Git-push deploys only with approval) and `vercel-cli` (`vercel/vercel`; CLI reference for deployments, env vars, domains, logs).
- **Mux** (`muxinc/skills`, 1): `mux-video` — finds the current Mux docs page for a topic (APIs, uploads, playback, live, Data, Robots) and answers from it. It recommends Video.js 10 for new web players; Mux Player for web is in maintenance mode.
- **UI SDK** (`vercel-labs/ui`, 1): `ui-sdk` — composing UI SDK components, building custom behaviors on `@ui-sdk/core`, agent bridge/WebMCP, and keyboard/focus/ARIA testing. UI SDK has no dev MCP server or CLI.
- **Web platform** (`GoogleChrome/modern-web-guidance`, 1): `modern-web-guidance` — current HTML, CSS and browser-API practices (dialogs, popovers, forms, accessibility, Core Web Vitals, security). It searches its guides with `npx -y modern-web-guidance@latest search "<query>"` (an npm package published by the Chrome team) and retrieves the matching ones. Interactive components still come from UI SDK; this skill guides the HTML, CSS and browser APIs around them. The `chrome-extensions` skill from the same repository is not installed.
- **AI agents** (`vercel/eve`, 1): `eve` — for building durable backend AI agents with the eve framework (instructions, tools, connections, channels, sandboxes, subagents, schedules, evals). Full version-matched docs live in `node_modules/eve/docs/` (`README.md`).

UI SDK's own docs for the installed version are in `node_modules/@ui-sdk/react/docs/` (start at `llms.txt`).

Maintenance:

```bash
npx skills update -p                 # update project skills
npx skills experimental_install      # restore from skills-lock.json (fresh clone)
scripts/check-dev-tooling.sh --online
```

Not installed yet: `npx convex ai-files install` would add Convex's coding guidelines to `AGENTS.md` and `convex/_generated/ai/`. Worth doing before writing the first Convex functions.

### Safety rules

- Never commit secrets. `.env*` is git-ignored (except `.env.example`). Before every commit, the staged diff is checked for key patterns and for the actual secret values in `.env.local`.
- Secrets go straight from a file or the clipboard into the service that uses them (`npx convex env set`, `vercel env add`) and are never printed or pasted into chat.
- Convex MCP never runs with `--dangerously-enable-production-deployments`.
- Agents that change `convex/` use their own deployment (see Agent deployments), not the owner's personal dev deployment. Deploy keys stay in the worktree's git-ignored `.env.local`.
- The Mux MCP and CLI act on whichever Mux environment they're signed in to; use the Development environment for agent work.
- Vercel production deploys and production env vars, and Clerk production changes (domains, billing, production instances), require explicit human confirmation.
