# Slide decks

Every chapter of a generated course has one slide deck. The model never writes HTML or slide markup: it fills a JSON shape, the JSON is validated, stored, and drawn by fixed React components. The same JSON can feed another renderer later (a PPTX export with PptxGenJS, for one); nothing about a deck lives in the viewer.

```
topic → research → outline (admin approves) → per chapter:
  chapter-writer saves the lessons and the test
  deck-writer returns the deck as JSON ──▶ validate ──▶ check diagrams ──▶ save ──▶ viewer
        ▲                                     │ invalid         │ invalid
        └── errors fed back (≤ 2 retries) ◀───┘                 └▶ that one slide is re-asked once;
                                                                   still invalid → bullets, no visual
```

For the course engine around this (jobs, the engine API, the write fan-out) see [course-engine.md](course-engine.md).

## The schema

`convex/lib/deck.ts` (Zod) is the one definition. Convex, the agent and the browser all import it.

```ts
Deck  { chapterId, title, slides: Slide[] }        // 8-15 slides, title first, summary last, unique ids
Slide {
  id, title,
  layout: "title" | "bullets" | "bullets+visual" | "visual-full" | "two-column" | "code" | "quote" | "summary",
  bullets?: string[],                               // at most 5, each at most 16 words (the prompt asks for under 12)
  left?, right?: string[],                          // two-column
  quote?, attribution?: string,                     // quote
  visual?: Visual,                                  // bullets+visual, visual-full
  code?: { language, content },                     // code: at most 18 lines
  notes: string,                                    // speaker notes, on every slide
}
Visual =
  | { type: "mermaid", code, caption? }
  | { type: "chart", chartType: "bar" | "line" | "pie", data: { label, value }[], caption? }   // 2-12 points; a pie at most 6
  | { type: "table", headers: string[], rows: string[][] }                                     // 2-6 columns, 1-8 rows
  | { type: "image_prompt", prompt, alt }           // a placeholder: learners see the alt text in a frame
```

Each layout has required fields and shows only its own: a `visual` on a `bullets` slide is refused, because it would never be seen. Unknown keys are dropped, so no markup field can ride along.

Three levels of strictness, on purpose:

| Check | Applies to | Why |
| ----- | ---------- | --- |
| `deckDraftSchema` / `deckSchema` (shape, per-layout fields, limits, title first, summary last, unique ids) | What the model returns, and again every generated save (`engine.saveDeck`) | The engine is the authority; the agent could be wrong or replaced |
| `generatedDeckProblems`: at least 40% of slides carry a visual | The model's answer only | A diagram that falls back to bullets, or an admin's edit, may lower the share and must still save |
| `slideValidator` (Convex, `convex/lib/engineTypes.ts`) | Stored rows | Wider than the schema: decks saved before slide ids, visuals and code existed still load, and hand edits follow `validateSlide` (6-20 slides) |

Storage only gained optional fields (`slides[].id`, `visual`, `code`, and `slideDecks.title`), so **no data migration is needed**. A deck without slide ids gets them when it is read (`withSlideIds`), and a deck without a title shows its chapter's.

Compared with a minimal deck schema: `two-column` keeps `left`/`right` and `quote` keeps `quote`/`attribution` (those layouts need them and older decks use them), and `notes` is required, as the engine already required it.

## Generation

One chapter per model call, in `agents/course-builder/`:

- **Brief** (`lib/deck-brief.ts`): the course (topic, language, level, audience), the **whole course outline** with this chapter marked, a **style guide** shared by every chapter of the course (voice, titles, bullet length, when to draw what, diagram size, no invented chart data, same terms as the lessons), the chapter's saved lessons (the deck presents only what they teach), source excerpts for quote slides (no URLs), and the rules. Decks are written in parallel and see no other deck, so the outline and the style guide are what keep them coherent.
- **Model call** (`subagents/deck-writer/`, Claude Opus 5.5, no tools): `ctx.agent("deck-writer").send(brief, { outputSchema: deckDraftSchema })`. The schema is the turn's structured output. `chapterId` is not asked of the model; the pipeline knows it.
- **Pipeline** (`lib/generate-deck.ts`, pure, model and engine injected):
  1. Validate the answer (`validateGeneratedDeck`). On failure, send every problem back into the same conversation and ask for the whole corrected deck: **at most 2 retries**. Problems read "slide 4 (s4) bullets 2: a bullet has at most 16 words".
  2. Check every Mermaid diagram with Mermaid's own parser (`lib/mermaid-validate.ts`, `mermaid.parse` in Node). An invalid diagram re-asks **only that slide**, with the parser's error and the diagram's source, once (`outputSchema: slideSchema`). If what comes back is not a valid slide with a valid diagram, the original slide **falls back to the `bullets` layout without the visual** (its own bullets, or its caption and notes when it had none), and the job's activity feed says so.
  3. Save through the engine. A refusal ("Unknown reference: …", "INVALID: …") is fed back like a validation error and shares the retry budget; `BAD_STATE` and `NOT_FOUND` are not retried.
- **Where it runs** (`lib/write-chapters.ts`): after the chapter writer has saved the lessons and the test, so the deck is built from saved content. A deck that cannot be saved leaves the chapter incomplete without failing the others; on a resumed write, a chapter whose deck is the only gap skips the chapter writer. **Regenerate deck** runs the pipeline alone with the admin's instruction in the brief; **Regenerate chapter** rewrites lessons and test, then the deck.

Server-side diagram validation lives in the agent, not in Convex: Mermaid's parser needs a DOM when it loads (it imports DOMPurify), and Convex functions have none. In Node the validator borrows a jsdom `window` for the import and removes it again. The engine keeps the checks that need no parser (no `%%{init}%%` directive, no `click` handler, a non-empty body) and scans diagram, caption and table text for unknown URLs. Supported diagram types: flowchart, sequence, state, class, ER, mindmap, timeline, gantt, journey, pie.

If the parser itself cannot load, the diagrams are kept unchecked, the activity feed reports it, and the viewer's own per-diagram fallback still applies.

## Viewer

`src/components/chapter/`: a custom React viewer, not Reveal.js. The repo already had a tested React deck with right-to-left handling and UI SDK controls, and Reveal owns the DOM it renders into.

| File | Role |
| ---- | ---- |
| `slide-deck.tsx` | `<SlideDeck deck language>`: one slide at a time, progress bar, counter, Prev/Next, overview, speaker notes, light/dark, fullscreen, swipe |
| `slide.tsx` | `<Slide slide>`: the stage plus the layout's component (also the admin editor's preview) |
| `slide-layouts.tsx` | One component per layout and the `SLIDE_LAYOUT_COMPONENTS` registry |
| `slide-stage.tsx` | The fixed frame and auto-scaling |
| `visuals/slide-visual.tsx` | One branch per visual type: Mermaid, chart, table, image placeholder |
| `visuals/mermaid-diagram.tsx` | Loads Mermaid on demand (`import("mermaid")`), themes it from the deck's CSS tokens, redraws on theme change |
| `visuals/chart-visual.tsx` | Recharts, loaded with `React.lazy`; the same numbers are in a visually hidden table |
| `deck-states.tsx` | Generating skeleton, error state with "Regenerate chapter slides", error boundary |
| `chapter-sidebar.tsx` | Course → chapters → the current chapter's slides, lessons and test |

**Keys**, on the focused deck (never on `window`): arrows (mirrored in a right-to-left deck), Space and Shift+Space, PageUp/PageDown, Home/End, Esc for the overview of all slides (Enter or a click opens one). In fullscreen Esc leaves fullscreen, as the browser requires.

**One size everywhere.** The stage is 16:9 (3:4 when the deck is narrower than 32rem, so a phone gets readable text) and sets its font size from its own width with container query units; layouts size everything in `em`. A slide looks the same inline, fullscreen and on a phone, with no script.

**Overflow.** Content that is taller or wider than the stage (a long list, a wide table) is measured and scaled down to fit. Below 60% it would be unreadable, so it is clipped at the stage's edge instead and a console warning names the slide. Nothing is drawn outside the stage; `e2e/slide-deck.spec.ts` checks every slide of the sample deck at desktop and phone width.

**Light and dark.** The app is dark-only. The deck alone has a "Light slides" switch (for projecting), remembered in `localStorage`: it redefines the colour tokens on the deck's root (`.slide-deck[data-theme="light"]` in `globals.css`), so every Tailwind colour utility inside follows, and diagrams are redrawn with the new tokens. Chart colours are a categorical palette checked per surface for colour-vision separation and contrast.

**States on the chapter page** (`chapter-view.tsx`):

| Situation | Shown |
| --------- | ----- |
| The chapter has a deck | The viewer, inside an error boundary |
| The deck throws while rendering | Error state; admins of a generated course also get "Regenerate chapter slides" |
| Locked (signed out, or Pro) | Sign-in or upgrade prompt, as before |
| No deck, admin, generation `writing` | Skeleton ("Generating slides…"); the deck appears when saved (the query is reactive) |
| No deck, admin, generation `failed` | Error with the job's error and a link to the job, where **Retry phase** lives |
| No deck, admin, generation `ready` | Error with "Regenerate chapter slides" (rebuilds this chapter's deck from its saved lessons) |
| No deck otherwise (hand-made or older chapter) | A pointer to the chapter's lessons, the text view |

Lessons were not replaced: tests, sources and practice quizzes depend on them, and they are the fallback when a chapter has no deck. But the deck comes first: Start, Continue, the course outline, the lesson sidebar, the lesson header and "Next" across a chapter boundary all lead to the chapter's slides (see "Slides first" in [course-engine.md](course-engine.md)), and the chapter page lists the lessons under the deck as the full text behind it.

## Sample deck

`src/components/chapter/samples/how-dns-works.deck.json` is a deck the pipeline generated with the real model (14 slides, 7 with a visual: 3 Mermaid diagrams, 3 tables, 1 chart; accepted on the first attempt). It is rendered at **`/samples/how-dns-works`**, a public, unlinked page (`noindex`), so the viewer can be checked without an account.

To generate it again: `EVAL_DECK_OUT=<file> npm run eval:course-builder -- dns-deck`. That runs `agents/course-builder/evals/dns-deck.eval.ts` against an in-memory engine holding a DNS course whose lessons and test are saved (`evals/lib/dns-course.ts`); it costs one root turn and one deck-writer call.

## Adding a layout

A layout is an enum value, its field rules, and one component. TypeScript and the tests point at whatever is missing.

1. **Schema** (`convex/lib/deck.ts`): add the name to `SLIDE_LAYOUTS` and its entry to `LAYOUT_FIELDS` (`needs`: required fields, `allows`: optional ones). A new field goes into `slideShape`, `CONTENT_FIELDS` and `deckTexts` (if learners read it).
2. **Storage** (`convex/lib/engineTypes.ts`): add the literal to `slideValidator` (and the field, as `v.optional`, if there is one). Additions are optional, so stored decks keep loading. Add the layout's check to `validateSlide` in `convex/lib/contentValidation.ts` for hand edits.
3. **Component** (`src/components/chapter/slide-layouts.tsx`): write the component and register it in `SLIDE_LAYOUT_COMPONENTS`. The registry is typed `Record<SlideLayout, …>`, so a layout without a component does not compile. Size in `em`; use `@lg:` only to switch columns on.
4. **Writer** (`agents/course-builder/agent/subagents/deck-writer/instructions.md`): add the row to the layout table (fields, when to use it). `agent.test.ts` there fails until every layout is mentioned.
5. **Editor** (`src/components/admin/deck-editor.tsx`): add it to `layouts`, to `cleanSlide`, and its fields to the form.
6. **Tests**: a case in `convex/lib/deck.test.ts` ("each layout needs its fields…") and one in `src/components/chapter/slide-deck.test.tsx` ("Slide layouts"). Push the validator change with `npx convex dev --once` from an agent worktree (see "Agent deployments" in `docs/ARCHITECTURE.md`); no new Convex module is added, so the generated API types do not change.

A new **visual type** is the same idea: a member of `visualSchema` and `visualValidator`, a branch in `visuals/slide-visual.tsx`, a line in `deckTexts`, and the writer's instructions.

## Export (not built)

Nothing exports to PPTX or PDF yet. An exporter would read the same `Deck` JSON the viewer reads (`chapters.getForViewer` returns it as `{ chapterId, title, slides }`) and map each layout to a slide master, as `SLIDE_LAYOUT_COMPONENTS` does for React. Diagrams would need rendering to an image (Mermaid's SVG) for PptxGenJS.

## Dependencies added

| Package | Why |
| ------- | --- |
| `mermaid` | Draws diagrams in the viewer; validates diagram syntax in the agent |
| `recharts` | Draws the bar, line and pie visuals |
| `jsdom` (moved from dev to runtime) | Mermaid's parser needs a DOM to load in Node; it was already installed for the tests |
