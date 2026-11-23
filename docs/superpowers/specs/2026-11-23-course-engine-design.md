# Course engine (AI course generation) — design and build contract

Date: 2026-11-23. State: **design, awaiting approval.** Scope: a **demo** (v1), built and shown locally on the dev setup (Clerk dev instance, an agent Convex deployment, Anthropic API). It stays v1; production hardening is out of scope.

## Intent

The platform will later be sold to organizations (schools, government offices, municipalities). To win them, v1 demonstrates the core: an admin types a topic, optionally adds their own material, and an AI agent builds a complete, reviewable course: chapters and subchapters, a slide deck per chapter, practice quizzes, recorded chapter tests, and a list of sources behind every section. Learners then take the course in the existing player, and the admin sees who passed.

The demo's centrepiece is **watching the course being built live**: sources found, outline proposed, chapters filling in.

## Goals, non-goals, anti-goals

**Goals (v1)**

- Single tenant: one organization, one or more admins (existing Clerk `admin` role) who generate and edit content; any number of signed-in learners.
- Generate a course from a topic in **English, Hebrew or Russian** (chosen per course).
- Inputs: topic, audience/level, length, free-text notes, and resources: **URLs, PDF uploads, YouTube links, pasted text**. Plus the agent's own web research.
- Output: course → chapters → subchapters. Each chapter: a **slide deck** (structured slides + speaker notes) and a **recorded chapter test**. Each subchapter: markdown reading with practice quizzes, embedded resources where useful, and a list of sources.
- One checkpoint: the admin reviews and edits the **outline** before the expensive writing phase.
- Generated course is a **draft**; the admin edits, can regenerate one subchapter/deck/test with an instruction, then publishes.
- Live progress view during generation.
- Learners: chapter page with deck, subchapter player (existing), chapter tests graded on the server, course completion.
- Admin results page: per learner, per chapter test: best score, passed, attempts.

**Non-goals (v1)**

Multi-tenancy/organizations, deploying the engine to Vercel, YouTube transcripts, narrated or AI-presenter video, translating the app UI (only course content is localized), open-answer/AI-graded questions, hands-on labs (separate project), Word/PowerPoint inputs, cost quotas or budgets, certificates, SCORM export, production deploy.

**Anti-goals (a failure even if it works)**

- AI content reaching learners without an admin publishing it.
- Invented sources: a cited URL the agent never actually saw.
- Correct test answers reaching the browser before grading.
- Shortcuts that would make adding organizations later a rewrite (e.g. global singletons; keep everything keyed by course).

## Decisions

### Owner's

- Single tenant v1, demo only.
- Slide decks only (no video). Built so narrated video (TTS from speaker notes → MP4 → Mux) can be added later without redesign.
- Tests: practice quizzes inside subchapters **plus** a recorded, auto-graded chapter test (multiple choice, multiple select, true/false), pass mark, limited retries, results visible to the admin.
- Languages: English, Hebrew, Russian, per course.
- External resources are both source material for the agent **and** may be placed in the course for learners (embedded video, further reading link, PDF download).
- Engine runs as a second **eve** agent next to Learnly (approach A below).
- The demo is built, tested **and shown locally** (`next dev` + `convex dev` against the agent's Convex deployment + the eve agent). No Vercel deployment of the engine in v1.
- **YouTube is embed-only.** The agent never reads a video's content. It knows only the title and channel (YouTube's public oEmbed endpoint, no key) plus what the admin writes about it, and may embed it where it fits.

### Builder's (change freely if the owner objects)

- Only course **content** is localized; the app chrome stays English. Hebrew content renders `dir="rtl" lang="he"` (lesson body, deck, test, chapter page).
- Course completion = every subchapter marked complete **and** every chapter test passed.
- Course length presets: **short** (3 chapters × 2–3 subchapters), **medium** (5 × 3), **long** (8 × 3–4). Hard cap 10 chapters, 5 subchapters each.
- Chapter test defaults: 8–10 questions, pass mark 70 %, 3 attempts. Editable per test.
- The agent may place resources it found itself (not only the admin's). Everything placed is visible in the draft.
- Model: Claude Opus 5.5 (`anthropic("claude-opus-5-5")` from `eve/models/anthropic`), same as Learnly, for both the root agent and the chapter writer.
- Cost: no limits; log token usage per job if eve exposes it, otherwise skip.

### Builder's calls from the design review (change freely if the owner objects)

- **Convex is the only memory that matters.** eve sessions are durable (30-day idle timeout, survive restarts), and `continue`/`regenerate` send to the stored `eveSessionId`. But every trigger message carries `jobId`, and `get_job` returns everything the agent needs (brief, resources, sources, approved outline, existing chapter content). If the stored session is gone or stranded by an eve version change, the route starts a fresh session and saves the new ID. Nothing relies on conversation history.
- **Spike first in step 3** (time-boxed to half a day). It must show three things: (a) a second message resumes the same session after a restart of `eve dev`; (b) a `Promise.all` fan-out of 10 `chapter-writer` subagents completes; (c) a PDF fetched by a tool reaches the model as a file part. If (b) or (c) fails and can't be worked around, fall back to approach B for the failing part only.
- **Watchdog.** A Convex cron every 5 minutes marks jobs in `researching`/`writing` as `failed` ("no progress for 15 minutes") when they have no `generationEvents` row in the last 15 minutes. The live view then offers **Retry phase**. The agent reports progress at least once per chapter and per source batch.
- **Route ordering.** The browser calls only the Next.js routes for start/approve/regenerate. The route checks the Clerk admin role, gets a Convex token with `auth().getToken()` (the Convex integration, no template), calls the Convex mutation (e.g. `approveOutline`) with `ConvexHttpClient`, then calls eve. If the eve call fails, the route records `dispatchError` on the job and the live view shows **Resume**, which re-sends the same idempotent message.
- **Subchapter order and slugs.** In chaptered courses `lessons.order` is per chapter, and display order is `(chapter.order, lesson.order)`. Lesson slugs stay unique per course, so `/courses/[slug]/lessons/[lessonSlug]` is unchanged. Prev/next crosses chapter boundaries. `chapterId` stays optional for flat legacy courses. After approval the Convex rows are the truth and `generationJobs.outline` is frozen history.
- **Fake mode goes through the real path.** `COURSE_ENGINE_MODE=fake` replaces only eve: a small fake agent in the Next.js route calls the same `/engine/*` HTTP actions with the secret, so E2E covers auth, idempotency and validation.
- **PDFs.** Upload cap 20 MB. The `read_resource` tool fetches the file from Convex storage and passes it to the model as a base64 file part. A PDF the model can't take is marked `unreadable` with a reason, and generation continues.
- **No invented links.** `saveSubchapter` validates `sourceIds` and also scans the markdown: every http(s) URL, `youtube` video ID and `resource` ID must belong to the job's `generationSources`/`courseResources`, or the save is rejected with a message telling the agent which one is unknown.
- **Mixed direction.** Inside an RTL container, paragraphs and list items get `dir="auto"`, and code blocks are always LTR. The builder checks that the site fonts have Hebrew and Cyrillic glyphs and adds a fallback (e.g. Noto Sans Hebrew) if not.
- **Test rules.**
  - Multiple-select questions are all-or-nothing.
  - The best attempt decides "passed".
  - A learner may retake a passed test while attempts remain.
  - Editing or regenerating a test bumps `chapterTests.version`. Attempts keep the version they were taken against, and earlier passes still count.

## Approaches considered

| | Approach | Trade-off | Verdict |
| - | -------- | --------- | ------- |
| **A** | Second eve agent `agents/course-builder/` with a `chapter-writer` subagent; Convex holds state and pushes live progress | Durable, long runs, parallel subagents, matches "core agent" and Learnly. Costs: a third local process, and a service credential to Convex (Clerk tokens expire after 60 s) | **Chosen** |
| B | Pipeline of Convex actions calling the Anthropic SDK, each scheduling the next | Simplest infra, easy `convex-test`. But we write the agent loop, 10-min action cap forces small steps, less agentic | Fallback if eve blocks |
| C | Anthropic Managed Agents | New hosted surface, less control over Convex writes, no gain for a demo | Rejected |

## Architecture

```
Admin browser
  │ /admin/generate (wizard) ──> Convex: generation.createJob (requireAdmin), resources upload (storage)
  │ ──> POST /api/course-builder/start (Next.js route: Clerk admin check)
  │        └─> eve course-builder: POST /eve/course-builder/v1/session  (service auth, see Auth)
  │              message = { jobId }   ── session id saved on the job
  │
  │ live progress: Convex queries on generationJobs + generationEvents (reactive)
  │
  │ outline ready → admin edits outline in Convex → "Approve"
  │ ──> POST /api/course-builder/continue → same eve session: { jobId, action: "write" }
  │
eve course-builder (root agent)
  phase 1  research: read admin resources, web_search, web_fetch, youtube_info
           save_sources, save_outline, report_progress           → Convex HTTP actions
  phase 2  write_course (workflow tool): fan out chapter-writer per chapter (Promise.all)
           chapter-writer: save_subchapter, save_deck, save_test → Convex HTTP actions
           finish_job
  later    regenerate: { jobId, action: "regenerate", target, instruction }
```

### Phases and job states

`generationJobs.status`: `queued → researching → outline_ready → writing → ready` (or `failed`).

1. **Research** (one agent turn). The agent reads every admin resource (URL via `web_fetch`, PDF fetched from Convex storage and passed as a file part, YouTube as title + channel via oEmbed only, pasted text as is), searches the web, records each source it actually used (`save_sources`), and saves an outline (`save_outline`): chapters and subchapters with titles, one-line goals, and planned resource placements. The turn ends. Status `outline_ready`.
2. **Outline review** (admin, no agent). The admin edits titles, reorders, adds/removes chapters/subchapters, changes notes, then approves. Approval creates the draft course skeleton (course, chapters, empty subchapters) and sends a new message to the same eve session (message history and state carry over; this is eve's "end the turn, send a new message" pattern, chosen over `ctx.ask` because it keeps the editable outline in Convex).
3. **Writing** (one agent turn). A workflow tool `write_course` loads the approved outline from Convex and runs one `chapter-writer` subagent per chapter in parallel (`ctx.agent("chapter-writer").send(...)` in `Promise.all`; at most 10, under eve's 32-task limit). Each writer gets the chapter outline, the course brief, the language, and the relevant source excerpts/URLs, and saves its subchapters, deck and test through tools. Then `finish_job` sets status `ready`.
4. **Regenerate** (optional, per item). The admin clicks "Regenerate" on a subchapter, deck or test with an instruction; the Next.js route sends `{ action: "regenerate", target, instruction }` to the session; the agent rewrites that item with the same save tool.

Failure handling (demo level): any tool error is reported as a `generationEvents` row; a failed chapter leaves the others intact and the admin can click **Retry chapter** (sends a regenerate for that chapter). A job-level failure sets `failed` with a message and offers **Retry phase**.

### Auth

- **Admin → Next.js routes** (`/api/course-builder/start|continue|regenerate`): Clerk `auth()`, require `sessionClaims.metadata.role === "admin"`; the route also verifies the job exists through Convex with the admin's token.
- **Next.js → eve channel:** service-to-service. The course-builder channel uses eve's `jwtHmac()` auth with a shared secret `COURSE_BUILDER_CHANNEL_SECRET` (Next.js signs a short-lived JWT per request). Works locally and on Vercel, unlike Vercel OIDC. Browsers never call this agent directly.
- **eve → Convex:** Convex HTTP actions under `/engine/*` (in `convex/http.ts`), each requiring `Authorization: Bearer <COURSE_ENGINE_SECRET>` (constant-time compare), then calling **internal** mutations. The secret lives in the Convex deployment env and in the agent's env (`.env.local`, Vercel). The Convex site URL is public, so this works when eve runs on the owner's laptop.
- Learners and admins read generated content only through the existing Convex queries and access rules.

### Idempotency

eve may replay a step. Every save is an upsert keyed by natural keys: `(jobId, url)` for sources, `(courseId, chapterOrder)` for chapters, `(chapterId, subchapterOrder)` for subchapters, `chapterId` for decks and tests. Saves for a job in `ready` state are refused unless it's a regenerate.

### Source integrity

Every source the agent saves must have been fetched or returned by search in this job: `save_sources` stores them in `generationSources`; `save_subchapter` takes `sourceIds`, and the HTTP action rejects IDs not belonging to the job. Admin-added resources become sources automatically. Subchapter markdown may reference sources as `[n]`; the player lists sources under the body.

## Data model (additions to `convex/schema.ts`)

| Table | Fields | Indexes |
| ----- | ------ | ------- |
| `courses` (changed) | + `language?` (`en\|he\|ru`, default `en`), `generationJobId?` | — |
| `chapters` (new) | `courseId`, `slug`, `title`, `summary`, `order` | `by_course_order`, `by_course_slug` |
| `lessons` (changed; = subchapters) | + `chapterId?`, `sourceIds?: Id<"generationSources">[]` | + `by_chapter_order` |
| `slideDecks` (new) | `courseId`, `chapterId`, `slides: Slide[]`, `updatedAt` | `by_chapter` |
| `chapterTests` (new) | `courseId`, `chapterId`, `version`, `passPercent`, `maxAttempts`, `questions: Question[]` | `by_chapter`, `by_course` |
| `testAttempts` (new) | `userId`, `courseId`, `testId`, `testVersion`, `answers`, `scorePercent`, `passed`, `submittedAt` | `by_user_test`, `by_test`, `by_user_course` |
| `courseResources` (new) | `jobId`, `courseId?`, `kind` (`url\|pdf\|youtube\|text`), `title`, `url?`, `storageId?`, `text?`, `origin` (`admin\|engine`), `readStatus` (`pending\|read\|embed_only\|unreadable`) | `by_job`, `by_course` |
| `generationJobs` (new) | `createdBy`, `topic`, `language`, `level`, `length`, `audience?`, `notes?`, `status`, `eveSessionId?`, `dispatchError?`, `outline?: Outline`, `courseId?`, `error?`, `usage?`, `createdAt`, `updatedAt` | `by_status`, `by_createdAt` |
| `generationEvents` (new) | `jobId`, `at`, `kind` (`info\|source\|outline\|chapter\|error`), `message`, `chapterOrder?` | `by_job_at` |
| `generationSources` (new) | `jobId`, `url`, `title`, `kind` (`web\|pdf\|youtube\|text`), `resourceId?`, `excerpt?` | `by_job`, `by_job_url` |

Shapes (validators in `convex/lib/engineTypes.ts`):

```ts
type Slide = {
  layout: "title" | "bullets" | "two-column" | "quote" | "summary";
  title: string;
  bullets?: string[];        // bullets / summary
  left?: string[]; right?: string[]; // two-column
  quote?: string; attribution?: string;
  notes: string;             // speaker notes = future narration script
};
type Question = {
  id: string;
  kind: "single" | "multiple" | "true_false";
  prompt: string;
  options: string[];         // true_false: ["True","False"] localized
  correct: number[];         // never sent to learners
  explanation: string;       // shown after submission
};
type Outline = { chapters: { title: string; goal: string; subchapters: { title: string; goal: string; resourceIds?: string[] }[] }[] };
```

Existing seed courses have no chapters; course and lesson pages fall back to today's flat list when a course has no `chapters`.

### Learner-facing resources in markdown

Same pattern as `quiz` blocks: fenced blocks with a JSON body, rendered by `LessonMarkdown`.

- ```` ```youtube {"videoId":"…","title":"…","start":0} ```` → privacy-enhanced embed (`youtube-nocookie.com`).
- ```` ```resource {"resourceId":"…"} ```` → PDF download card (URL resolved through a Convex query that checks lesson access) or link card.
- Plain markdown links for further reading.

Invalid blocks render an inline error box, like quizzes.

## Convex API

| Function | Kind | Does |
| -------- | ---- | ---- |
| `generation.createJob({ topic, language, level, length, audience?, notes? })` | mutation, admin | Inserts `queued` job |
| `generation.addResource({ jobId, kind, url?, storageId?, text?, title? })`, `removeResource`, `generateUploadUrl` | mutation, admin | Resources before start |
| `generation.get({ jobId })`, `generation.list()`, `generation.events({ jobId })` | query, admin | Live progress |
| `generation.updateOutline({ jobId, outline })` | mutation, admin | Only in `outline_ready` |
| `generation.approveOutline({ jobId })` | mutation, admin | Creates course (draft) + chapters + empty lessons, status `writing` |
| `chapters.listForCourse`, `chapters.getForViewer({ courseSlug, chapterSlug })` | query | Chapter page data: deck, subchapters, test summary, viewer's best attempt |
| `tests.getForViewer({ testId })` | query | Questions **without** `correct`/`explanation` |
| `tests.submit({ testId, answers })` | mutation | Access check, attempt limit, grade, insert attempt, return score + per-question correctness + explanations |
| `tests.resultsForCourse({ courseId })` | query, admin | Results table |
| `progress.courseCompletion({ courseId })` | query | Lessons done + tests passed → complete |
| `admin.*` additions | mutation, admin | Edit chapter, deck slides, test questions/settings |
| HTTP `/engine/*` → `engine.*` internal mutations | HTTP action + internal | `getJob`, `getResources`, `saveSources`, `saveOutline`, `reportProgress`, `saveSubchapter`, `saveDeck`, `saveTest`, `finishJob`, `failJob` (all secret-guarded, idempotent) |

Access for chapters, decks and tests reuses `canAccessLesson` inputs: a chapter is accessible when the course is accessible to the viewer (free → signed in, pro → Pro/admin; drafts admin only). Tests require sign-in.

## eve agent (`agents/course-builder/`)

```
agents/course-builder/
  agent/
    agent.ts                 defineAgent: Opus 5.5, defaultTools: false
    instructions.md          role, phases, language rules, source integrity, quality bar
    channels/eve.ts          jwtHmac(COURSE_BUILDER_CHANNEL_SECRET)
    lib/engine-client.ts     typed client for Convex /engine/* (COURSE_ENGINE_SECRET)
    tools/
      web_search.ts, web_fetch.ts   re-enable eve built-ins
      get_job.ts             job brief, resources, approved outline
      read_resource.ts       URL text / PDF file part (Convex storage URL) / pasted text
      youtube_info.ts        title + channel for a video URL via oEmbed (embed-only, no transcript)
      save_sources.ts, save_outline.ts, report_progress.ts, finish_job.ts
      write_course.ts        workflow tool: parallel chapter-writer fan-out
      regenerate.ts          rewrite one subchapter / deck / test
    subagents/chapter-writer/
      agent.ts, instructions.md
      tools/ save_subchapter.ts, save_deck.ts, save_test.ts, report_progress.ts
  evals/                     smoke eval with a fake engine client
```

Writing rules in `instructions.md`: write in the course language (sources may be in any language), keep proper nouns, use only saved sources, 1–3 practice `quiz` blocks per subchapter, embed a resource only when it clearly helps, slides 6–12 per chapter with speaker notes of 2–4 sentences, test questions answerable from the chapter's subchapters.

Next.js wiring: `withEve` already proxies workspace agents; add the agent, and `/api/course-builder/*` route handlers. Local dev gets a script that runs the course-builder agent alongside `dev:all`.

## UI

Admin (UI SDK wrappers from `src/components/ui/`):

- **`/admin/generate`** wizard: topic, language, level, length, audience, notes, resources (add URL / YouTube / paste text / upload PDF). **Generate** starts the job.
- **`/admin/generate/[jobId]`** live view: status stepper (Research → Outline → Writing → Ready), event feed (sources found, chapters done), sources list. In `outline_ready`: editable outline tree + **Approve and write**. In `writing`: chapter cards turning green. In `ready`: **Open draft course**.
- **Course editor** (`/admin/courses/[courseId]`) gains: chapters list, deck editor (slide list; edit fields; reorder; preview), test editor (questions, correct answers, pass mark, attempts), **Regenerate** with an instruction on subchapter/deck/test, and a **Results** tab (learner × chapter test).
- **`/admin`** lists generation jobs.

Learner:

- **Course page**: outline grouped by chapter (deck, subchapters, test per chapter), completion state.
- **`/courses/[slug]/chapters/[chapter]`**: slide deck viewer (keyboard arrows, slide counter, speaker notes toggle, full-screen), subchapter list, test entry.
- **Subchapter** = existing lesson player + sources list + `youtube`/`resource` blocks.
- **`/courses/[slug]/chapters/[chapter]/test`**: questions, submit, score, per-question feedback with explanations, attempts left.
- **Dashboard**: course completion includes tests.
- Hebrew courses: content containers get `dir="rtl" lang="he"`; deck and test layouts mirror.

## Environment

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `ANTHROPIC_API_KEY` | `.env.local`, Vercel | Already used by Learnly |
| `COURSE_BUILDER_CHANNEL_SECRET` | `.env.local`, Vercel | Next.js → eve channel JWT |
| `COURSE_ENGINE_SECRET` | Convex deployment env, `.env.local`, Vercel | eve → Convex `/engine/*` |
| `CONVEX_SITE_URL` (or derived from `NEXT_PUBLIC_CONVEX_URL`) | agent env | Base for `/engine/*` |
| `COURSE_ENGINE_MODE` (`live\|fake`) | Next.js env | `fake` makes `/api/course-builder/*` write a canned course instead of calling eve (E2E, offline demo fallback) |

Secrets are generated with `openssl rand`, piped straight into `npx convex env set` / `.env.local`, never printed.

## Tests

- **Unit (`convex-test`):** grading for each question kind; attempt limit; `getForViewer` never returns `correct`; `/engine/*` rejects a missing/wrong secret; saves are idempotent (replayed save → one row); `saveSubchapter` rejects foreign `sourceIds`; `approveOutline` builds course/chapters/lessons from the outline and only in `outline_ready`; course completion rule; chapter/test access matrix; drafts invisible to learners.
- **Agent:** tool unit tests against a fake engine client; `chapter-writer` output schema; one eve eval that generates a tiny course (1 chapter) end to end against the fake client (run manually, costs tokens).
- **Component:** wizard validation, live view per status (fake data), outline editor, deck viewer (navigation, notes, RTL), test player (submit, feedback, attempts exhausted), markdown `youtube`/`resource` blocks.
- **E2E (Playwright, production build):** signed-out learner sees a chapter page with a sign-in prompt for the test; with `COURSE_ENGINE_MODE=fake`, the admin flow once Clerk testing tokens exist (same open item as other signed-in flows).

## Implementation order

Each step ends with `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and updates to `docs/ARCHITECTURE.md` and a new `docs/features/course-engine.md`. All work happens in a git worktree with its own Convex deployment (`scripts/agent-deployment.sh`).

1. **Content model and learner experience (no AI).** Schema additions, chapters/decks/tests/attempts functions, grading, completion, seed one hand-written chaptered course (in Hebrew, to prove RTL), course page by chapter, chapter page with deck viewer, test player, sources list, `youtube`/`resource` blocks.
2. **Admin generation shell.** Jobs, resources (incl. PDF upload), wizard, live view, outline editor + approve, `/engine/*` HTTP actions with the secret, `/api/course-builder/*` routes, `COURSE_ENGINE_MODE=fake` producing a canned course.
3. **Agent: research and outline.** Spike first (see Builder's calls). Then the `agents/course-builder/` scaffold, channel auth, engine client, resource readers (URL, PDF, YouTube title via oEmbed, text), web search/fetch, sources, outline, progress events.
4. **Agent: writing.** `chapter-writer` subagent, `write_course` fan-out, decks, tests, resource placement, `finish_job`, retry chapter.
5. **Admin review.** Deck editor, test editor, chapter edit, regenerate with instruction, results tab, jobs list.
6. **Demo run (local).** Generate one short course per language from real inputs (a URL, a PDF, a YouTube video to embed). Record duration, token usage, and issues in `docs/features/course-engine.md`.

## Owner setup

1. Approve this design.
2. Commit or stash the current uncommitted work on `main` (header, dashboard, e2e, labs spec) so the worktree starts from it.
3. Pick demo topics for step 6 (one per language).

## Open questions

- **Course `tier` for generated courses.** Default `free` (any signed-in learner); the admin can switch to `pro` in the editor.

## Left to the builder

Exact UI layout and styling within the existing design tokens; slide visual design; prompt wording; how chapter source excerpts are passed to writers (URLs vs. excerpts); event wording; slug generation for non-Latin titles (transliterate or use order-based slugs).
