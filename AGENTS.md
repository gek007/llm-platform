<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

LMS platform: Next.js (App Router) + Clerk (auth) + Convex (backend) + Vercel (hosting) + UI SDK (components). Architecture, tooling and conventions live in `docs/ARCHITECTURE.md`; keep it up to date with every step.

## UI SDK

Before using ui-sdk, follow the `ui-sdk` skill and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.

## Testing

Every step ships with tests:

- Unit and component tests: Vitest + Testing Library, colocated as `src/**/*.test.tsx` (`npm test`).
- End-to-end tests: Playwright in `e2e/`, run against a production build (`npm run test:e2e`).
- Before finishing: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`.
