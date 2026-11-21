# LMS Platform

Learning management system built with Next.js, Clerk, Convex, Vercel and UI SDK.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, structure and developer tooling.

## Development

```bash
npm install
npm run dev:all          # Next.js (http://localhost:3000) + Convex in one terminal
```

Or run them separately: `npm run dev` (Next.js) and `npm run dev:convex` (syncs `convex/` to the dev deployment on every save). `npm run dev:convex -- --once` pushes `convex/` a single time and exits.

## Deploy

Hosted on Vercel (<https://llm-platform-xi.vercel.app>). Pushing to `main` deploys to production; other branches get preview deployments. `vercel deploy` creates a preview from the working tree.

## Checks

```bash
npm run typecheck
npm run lint
npm test                 # Vitest unit/component tests
npx playwright install chromium   # once
npm run test:e2e         # Playwright against a production build
scripts/check-dev-tooling.sh --online
```
