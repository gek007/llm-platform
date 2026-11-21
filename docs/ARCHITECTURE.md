# LMS Platform — Architecture

Living document. Update it whenever a step changes the stack, structure, or tooling.

## Status

| Step | Scope | State |
| ---- | ----- | ----- |
| 0 | Local AI/dev tooling for Clerk, Convex, Hostinger, UI SDK | Done, pending review |
| 1 | Next.js app scaffold, UI SDK packages, Vitest + Playwright | Done, pending review |
| 2 | Source folder structure, styled UI SDK wrappers, typed course mock data | Done, pending review |
| 3 | Clerk ↔ Convex backend integration (Convex accepts Clerk session tokens) | Done, pending review |

The app is a placeholder home page. Convex trusts Clerk tokens (see Clerk ↔ Convex auth), but the Next.js app has no Clerk or Convex providers yet; course data comes from typed mocks in `src/lib/courses/`.

## Stack

| Layer | Choice | Version |
| ----- | ------ | ------- |
| Framework | Next.js, App Router, `src/` directory, Turbopack | 16.4.6 |
| UI runtime | React | 19.3.0 |
| Language | TypeScript (strict), import alias `@/*` → `src/*` | 5.9 |
| Styling | Tailwind CSS v4 (`@layer ui-sdk;` declared first in `globals.css`) | 4.3.3 |
| Components | `@ui-sdk/core` + `@ui-sdk/react` (beta, pinned exact) | 0.1.0-beta.13 |
| Backend SDK + CLI | `convex` (auth config only; no functions or schema yet) | 1.51.0 |
| Unit/component tests | Vitest + jsdom + Testing Library + jest-dom | Vitest 5.1 |
| End-to-end tests | Playwright (Chromium) against `next build && next start` | 1.65 |
| Lint | ESLint 9 with `eslint-config-next` | — |
| Package manager | npm | — |

`next.config.ts` enables Cache Components (`cacheComponents: true`) and partial prefetching, as scaffolded by create-next-app 16.4. Version-matched Next.js docs ship in `node_modules/next/dist/docs/`; read them before writing Next.js code.

UI SDK components can render from server components (their modules already declare `"use client"`). Own components need `"use client"` when they hold state, effects or event handlers, or call `createParts`. Style them through `data-slot` and state attributes (e.g. Tailwind `group-data-open:`); no `web.css` default theme is used.

## Services

| Concern | Service | Role |
| ------- | ------- | ---- |
| Frontend | [Next.js](https://nextjs.org/docs) | Routing, server rendering, layouts |
| Authentication | [Clerk](https://clerk.com/docs) | Sign-in/up, users, organizations, roles |
| Backend & database | [Convex](https://docs.convex.dev) | Schema, queries/mutations/actions, realtime sync, file storage, crons |
| Hosting, domains, DNS | [Hostinger](https://docs.hostinger.com) | Frontend hosting (web hosting or VPS), domain and DNS |
| UI behaviors | [UI SDK](https://ui-sdk.dev/docs) (beta) | Accessible behaviors (focus, keyboard, selection, popups, drag and drop, ARIA) via `@ui-sdk/core` + framework adapter |

Clerk is the only auth provider; Convex validates Clerk-issued session tokens (see Clerk ↔ Convex auth). Convex Auth is intentionally not used.

### Clerk ↔ Convex auth

Follows Clerk's [Convex integration guide](https://clerk.com/docs/guides/development/integrations/databases/convex). No JWT template is used.

1. **Clerk:** the Convex integration is activated for the instance (Dashboard → [Integrations → Convex](https://dashboard.clerk.com/apps/setup/convex)). It adds `aud: "convex"` to every session token. Tokens are RS256, issued by the Frontend API URL, and expire after 60 seconds; the Clerk SDK refreshes them.
2. **Convex:** `convex/auth.config.ts` trusts one provider: `domain` is `CLERK_FRONTEND_API_URL` from the deployment env, and `applicationID: "convex"` must equal the token's `aud`. Convex fetches the signing keys from `<domain>/.well-known/jwks.json`.
3. **Inside Convex functions:** `ctx.auth.getUserIdentity()` returns `null` for anonymous calls. For a signed-in user it returns `subject` (the Clerk user ID, `user_…`), `issuer` and `tokenIdentifier` (`<issuer>|<subject>`). An invalid or expired token fails the call with `Unauthenticated`.
4. **Next.js (not wired yet):** `<ClerkProvider>` wraps a `"use client"` `ConvexProviderWithClerk` (`convex/react-clerk`) that receives `useAuth` from `@clerk/nextjs`. Components read the auth state with `useConvexAuth()` or `<Authenticated>`/`<Unauthenticated>` from `convex/react`, not with Clerk's hooks. That way they wait until Convex has validated the token.

Verified on 2026-11-21 against the dev deployment. A throwaway Clerk test user got a session token with `aud: "convex"` and `iss: https://pro-giraffe-8779.clerk.accounts.dev`. A temporary Convex query called with that token returned the user's identity; without a token it returned `null`; with a tampered signature it was rejected. The test user and the query were deleted afterwards. `scripts/check-dev-tooling.sh --online` repeats the configuration part of this check.

Production needs a Clerk production instance first. Then run `npx convex env --prod set CLERK_FRONTEND_API_URL https://clerk.<domain>` and `npx convex deploy`.

## Environment

| Resource | Name / ID | Dashboard |
| -------- | --------- | --------- |
| Clerk application | "LMS Platform" `app_3MQ6Ah3aicMxqGdRvLxQwJi2ljf` (development instance) | [dashboard.clerk.com](https://dashboard.clerk.com) |
| Convex project | `kostya-shilkrot/llm-platform`: dev deployment `hallowed-iguana-534`, prod deployment `tremendous-firefly-113` (both eu-west-1; prod is empty and read-only to the MCP server) | [dashboard.convex.dev](https://dashboard.convex.dev/t/kostya-shilkrot/llm-platform) |

`.env.local` (git-ignored, mode 600):

| Key | Used by | Source |
| --- | ------- | ------ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Next.js (browser + server) | `clerk env pull --file .env.local` |
| `CLERK_SECRET_KEY` | Next.js server only | `clerk env pull --file .env.local` |
| `CONVEX_DEPLOYMENT` | Convex CLI (`npx convex dev`, MCP server) | `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_URL` | `ConvexReactClient` / server fetches | `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex HTTP actions (e.g. webhooks) | `npx convex dev` |

Convex deployment env vars (`npx convex env list`), read by Convex functions:

| Key | Value |
| --- | ----- |
| `CLERK_FRONTEND_API_URL` | Clerk Frontend API URL of the dev instance (`https://pro-giraffe-8779.clerk.accounts.dev`), read by `convex/auth.config.ts`. Clerk's guide uses this name; Convex's older docs call it `CLERK_JWT_ISSUER_DOMAIN`. |

Setting up a new machine: `clerk auth login && clerk link --app app_3MQ6Ah3aicMxqGdRvLxQwJi2ljf && clerk env pull --file .env.local`, then `npx convex dev` (select the existing `llm-platform` project). `scripts/check-dev-tooling.sh` fails if `.env.local` is missing a key listed in `.env.example`.

Production credentials (a Clerk production instance, a Convex prod deploy key) are not created yet; they go into Hostinger's environment variables at deploy time, never into files.

## Repository layout

```
.agents/skills/               Agent skills (installed by `npx skills`, pinned in skills-lock.json)
.cursor/mcp.json              Project MCP servers: clerk, convex, hostinger
.env.example                  Every env key the app needs, without values (committed)
.env.local                    Real dev values (git-ignored; see Environment)
AGENTS.md                     Agent instructions (Next.js block is managed by `next dev`)
convex/                       Convex backend functions; convex/_generated/ is written by `npx convex dev`
  auth.config.ts              Trusts Clerk session tokens (see Clerk ↔ Convex auth)
docs/ARCHITECTURE.md          This file
e2e/                          Playwright end-to-end tests
public/                       Static assets
scripts/check-dev-tooling.sh  Verifies CLIs, MCP config, skills, .env.local; --online adds MCP and Clerk ↔ Convex checks
src/
  app/                        App Router routes only: layouts, pages, route handlers, globals.css
  components/
    ui/                       App-styled UI SDK wrappers (one file per component, e.g. accordion.tsx)
    layout/                   Page chrome: header, footer, sidebars, shells
  config/                     Static app config (site.ts: name, description)
  hooks/                      Shared client hooks (`use-*.ts`, "use client")
  lib/
    utils.ts                  cn() and mergeClassName() for class composition
    courses/                  Course domain: types.ts, mock-data.ts, queries.ts
  test/setup.ts               Vitest setup: jest-dom, jsdom stubs for ui-sdk, strict mode, cleanup
playwright.config.ts          E2E config; builds and starts the app on port 3100
vitest.config.mts             Unit test config (jsdom, tsconfig paths)
skills-lock.json              Exact source commit + hash of every installed skill
```

`.agents/` is excluded from `tsconfig.json` and ESLint because some skills ship template projects.

### Source conventions

- **Files:** kebab-case (`course-card.tsx`, `use-media-query.ts`); named exports everywhere except Next.js route files, which need default exports.
- **Imports:** use the `@/` alias across folders (`@/components/ui/accordion`), relative paths within a folder. No barrel `index.ts` files; import from the file that defines the thing.
- **Where code goes:** `app/` composes; it should not hold reusable components or data logic. Reusable UI goes in `components/`, domain logic and data access in `lib/<domain>/`, cross-cutting helpers in `lib/utils.ts`.
- **Server first:** components are Server Components unless they need state, effects, event handlers or browser APIs; then the file starts with `"use client"`. Keep client components small and push them to the leaves.
- **UI components:** pages import UI SDK parts through `@/components/ui/*`, which apply the app's Tailwind styles. Wrappers keep the UI SDK API (same part names and props), merge `className` with `mergeClassName` so string and state-function forms both work, and add only visual details (like the accordion chevron). Use UI SDK parts directly only for one-off cases.
- **Tests:** colocated next to the file (`queries.test.ts` beside `queries.ts`). This applies in `convex/` too: Convex skips files with more than one dot in the name, so `*.test.ts` files are never deployed.

## Data model (draft)

Defined in `src/lib/courses/types.ts` and mirrored on Convex documents (`_id`, `_creationTime`, `Id<"table">` references), so it can become `convex/schema.ts` with little change. `src/lib/courses/mock-data.ts` holds sample documents; `src/lib/courses/queries.ts` exposes read functions with the names the Convex queries will have.

| Table | Fields | Notes |
| ----- | ------ | ----- |
| `users` | `clerkId`, `name`, `role` (`student` \| `instructor` \| `admin`) | Synced from Clerk |
| `courses` | `slug`, `title`, `summary`, `level`, `status` (`draft` \| `published` \| `archived`), `tags`, `instructorId → users` | Public pages show `published` only |
| `lessons` | `courseId → courses`, `slug`, `title`, `summary`, `kind` (`video` \| `article` \| `quiz`), `order`, `durationMinutes` | `order` runs 1..n per course; slug unique per course |

| Query | Returns |
| ----- | ------- |
| `listPublishedCourses()` | Published courses, newest first |
| `getPublishedCourseBySlug(slug)` | A published course or `null` (drafts are hidden) |
| `listLessons(courseId)` | The course's lessons by `order` |
| `getLessonBySlug(courseId, slug)` | A lesson within that course or `null` |
| `getUser(userId)` | A user or `null` |
| `getCourseDurationMinutes(courseId)` | Sum of lesson durations |

Enrollments and lesson progress are not modeled yet; they arrive with Clerk + Convex.

## Testing

| Command | What it runs |
| ------- | ------------ |
| `npm run typecheck` | `next typegen` (route types such as `LayoutProps`) then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest once; `npm run test:watch` for watch mode |
| `npm run test:e2e` | Playwright; starts a production server on `PORT` (default 3100) |

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
| `hostinger` | Remote HTTP `https://mcp.hostinger.com` | OAuth in browser | Hosting, domains, DNS, VPS, billing. Mutating calls must be confirmed by a human |

### CLIs

| CLI | Install | Auth |
| --- | ------- | ---- |
| `clerk` | `npm i -g clerk` | `clerk auth login`; `clerk link` once the app exists |
| `convex` | Project dependency (`npm i convex`), run via `npx convex` | `npx convex login` |
| `hostinger` | `brew install hostinger/tap/hostinger` | `hostinger auth login` (or `HOSTINGER_API_TOKEN` for CI) |

### Skills (`.agents/skills/`)

Cursor loads these automatically; invoke manually with `/skill-name`.

- **Clerk** (`clerk/skills`, 17): `clerk` router, `clerk-cli`, `clerk-setup`, `clerk-custom-ui`, `clerk-backend-api`, `clerk-orgs`, `clerk-billing`, `clerk-testing`, `clerk-webhooks`, `clerk-migrate`, and web-framework patterns (Next.js, React, React Router, TanStack, Astro, Vue, Nuxt). Native mobile and Chrome-extension skills are excluded.
- **Convex** (`convex/agent-skills`, 31): all official skills except `convex-auth` (conflicts with Clerk) and `convex-improve-convex-plugin` (uploads session transcripts).
- **Hostinger** (`hostinger/api-mcp-server`, 11): hosting/VPS deploy, domain, audit, security and troubleshooting skills. `maintain-wordpress` is excluded.
- **UI SDK** (`vercel-labs/ui`, 1): `ui-sdk` — composing UI SDK components, building custom behaviors on `@ui-sdk/core`, agent bridge/WebMCP, and keyboard/focus/ARIA testing. UI SDK has no dev MCP server or CLI.

UI SDK's own docs for the installed version are in `node_modules/@ui-sdk/react/docs/` (start at `llms.txt`).

Maintenance:

```bash
npx skills update -p                 # update project skills
npx skills experimental_install      # restore from skills-lock.json (fresh clone)
scripts/check-dev-tooling.sh --online
```

Once a Convex project exists, `npx convex ai-files install` adds Convex guidelines to `AGENTS.md` and `convex/_generated/ai/`.

### Safety rules

- Never commit secrets. `.env*` is git-ignored (except `.env.example`).
- Convex MCP never runs with `--dangerously-enable-production-deployments`.
- Hostinger and Clerk production changes (DNS, domains, billing, production instances) require explicit human confirmation.
