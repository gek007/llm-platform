# LMS Platform

Learning management system built with Next.js, Clerk, Convex, Hostinger and UI SDK.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, structure and developer tooling.

## Development

```bash
npm install
npm run dev              # http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                 # Vitest unit/component tests
npx playwright install chromium   # once
npm run test:e2e         # Playwright against a production build
scripts/check-dev-tooling.sh --online
```
