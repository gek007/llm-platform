https://www.youtube.com/watch?v=rEGCDAeggAE&t=14556s

# LMS Platform

Learning management system built with Next.js, Clerk, Convex, Vercel and UI SDK.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, structure and developer tooling.

## Development

```bash
npm install
npm run dev:all          # Next.js (http://localhost:3000) + Convex in one terminal
```

Or run them separately: `npm run dev` (Next.js) and `npm run dev:convex` (syncs `convex/` to the dev deployment on every save). `npm run dev:convex -- --once` pushes `convex/` a single time and exits.

## Slide decks

Every chapter of a generated course has a slide deck with diagrams, charts and tables. The model never writes HTML: it fills a JSON shape that is validated, stored and drawn by fixed React components. Full reference: [docs/features/slide-decks.md](docs/features/slide-decks.md). A deck the pipeline generated is at `/samples/how-dns-works` (no account needed).

### How the pipeline works

```
topic → research → outline (admin approves) → per chapter:
  chapter-writer saves the lessons and the test
  deck-writer returns the deck as JSON → validate → check diagrams → save → viewer
```

1. **Schema.** `convex/lib/deck.ts` (Zod) defines `Deck { chapterId, title, slides }`: eight layouts, four visual types (`mermaid`, `chart`, `table`, `image_prompt`), and the limits (8-15 slides, title first, summary last, at most 5 short bullets). Convex, the agent and the browser import the same file.
2. **Generate.** One model call per chapter: the `deck-writer` subagent (`agents/course-builder/agent/subagents/deck-writer/`) gets a brief with the course outline, a style guide shared by all chapters and the chapter's saved lessons (`lib/deck-brief.ts`), and answers with the schema as its structured output.
3. **Validate and retry.** `lib/generate-deck.ts` checks the answer against the schema and the generation rule (at least 40% of slides carry a visual). On failure it sends the list of problems back and asks again, at most twice.
4. **Diagrams.** Every Mermaid diagram is parsed with `mermaid.parse` in the agent (`lib/mermaid-validate.ts`). An invalid one re-asks only that slide, once, with the parser's error; if it is still invalid the slide falls back to the `bullets` layout without the visual.
5. **Store.** `engine.saveDeck` (`convex/engine.ts`) validates against the same schema again and saves to `slideDecks`. Older decks need no migration: the new fields are optional and missing slide ids are filled in on read.
6. **Render.** `<SlideDeck deck language>` (`src/components/chapter/slide-deck.tsx`) draws the JSON: arrow keys, Space, Esc for the overview, progress bar, counter, fullscreen, speaker notes, narration with the browser's voice ("Listen"), a light theme, and auto-scaling so nothing leaves the slide. Mermaid and Recharts load only when a slide needs them. A chapter without a deck shows its lessons, as before.

Run the pipeline on its own with the real model (one root turn and one deck-writer call):

```bash
npm run eval:course-builder -- dns-deck                               # checks what the engine stored
EVAL_DECK_OUT=deck.json npm run eval:course-builder -- dns-deck       # also writes the deck JSON
```

### How to add a layout

1. `convex/lib/deck.ts`: add the name to `SLIDE_LAYOUTS` and its required and optional fields to `LAYOUT_FIELDS`.
2. `convex/lib/engineTypes.ts`: add the literal to `slideValidator`; `convex/lib/contentValidation.ts`: add its check to `validateSlide` (hand edits).
3. `src/components/chapter/slide-layouts.tsx`: write the component and register it in `SLIDE_LAYOUT_COMPONENTS`. The registry is typed by the schema's layouts, so a layout without a component does not compile.
4. `agents/course-builder/agent/subagents/deck-writer/instructions.md`: add its row to the layout table, so the writer knows when to use it.
5. `src/components/admin/deck-editor.tsx`: add it to `layouts`, `cleanSlide` and the form.
6. Add a case to `convex/lib/deck.test.ts` and `src/components/chapter/slide-deck.test.tsx`, then run the checks below.

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
