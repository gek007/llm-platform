# Course Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin types a topic (plus optional URLs, PDFs, YouTube links, pasted text) and a `course-builder` eve agent produces a reviewable draft course: chapters → subchapters, a slide deck and a recorded test per chapter, practice quizzes and sources; learners take it in English, Hebrew or Russian.

**Architecture:** Convex holds all state (courses, chapters, decks, tests, attempts, generation jobs, events, sources) and pushes live progress to the admin UI. A second eve agent (`agents/course-builder/`, Claude Opus 5.5) researches, proposes an outline, waits for approval, then fans out a `chapter-writer` subagent per chapter; it writes into Convex only through secret-guarded HTTP actions (`/engine/*`). Next.js route handlers (`/api/course-builder/*`) check the Clerk admin role and dispatch to the agent (or to a fake engine that uses the same `/engine/*` path).

**Tech Stack:** Next.js 16 App Router, Convex (+ `convex-test`), Clerk, eve 1.3 (`eve/models/anthropic`), UI SDK, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-course-engine-design.md` (read it first; this plan argues from it).

## Global Constraints

- Work in a git worktree created with superpowers:using-git-worktrees; run `scripts/agent-deployment.sh` before touching `convex/`. Never push to `hallowed-iguana-534`.
- Before Next.js code read the relevant guide in `node_modules/next/dist/docs/`; before UI work follow the `ui-sdk` skill and read `node_modules/@ui-sdk/react/docs/llms.txt`; before eve code read `node_modules/eve/docs/` pages named in the task.
- Model: `anthropic("claude-opus-5-5")` from `eve/models/anthropic`, `defaultTools: false`, root and writer `reasoning: "high"`. Never AI Gateway IDs.
- Languages: `"en" | "he" | "ru"`, default `"en"`. Only `he` is RTL (`dir="rtl" lang="he"` on content containers; paragraphs/list items `dir="auto"`; code blocks always LTR). App chrome stays English.
- Length presets: `short` = 3 chapters × 2–3 subchapters, `medium` = 5 × 3, `long` = 8 × 3–4. Hard cap 10 chapters, 5 subchapters per chapter.
- Chapter test defaults: 8–10 questions, `passPercent: 70`, `maxAttempts: 3`. Kinds `single | multiple | true_false`. Multiple = all-or-nothing. Best attempt decides passed. Editing/regenerating bumps `version`; earlier passes still count.
- `correct` and `explanation` never leave the server before a submission.
- Draft courses (and their chapters, decks, tests, resources) are visible to admins only.
- Course completion = every lesson complete **and** every chapter test passed.
- PDF upload cap 20 MB. YouTube is embed-only (title + channel via `https://www.youtube.com/oembed?url=…&format=json`).
- Secrets: `COURSE_ENGINE_SECRET` (Convex env + `.env.local`), `COURSE_BUILDER_CHANNEL_SECRET` (`.env.local`). Generate with `openssl rand -hex 32` piped straight into `npx convex env set` / `.env.local`; never print.
- `COURSE_ENGINE_MODE=fake|live` (Next.js env; default `live`).
- Watchdog: cron every 5 minutes, stall threshold 15 minutes.
- Lesson `order` stays global per course; chapters group via `lessons.chapterId`.
- Tests colocated (`*.test.ts(x)`); every UI SDK interface gets a `createAgent` test; `globalThis.__UI_SDK_STRICT__ = true`.
- Each milestone ends with `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and updates to `docs/ARCHITECTURE.md` (status row 11, data model, layout) and `docs/features/course-engine.md`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Double submit.** An admin double-clicks Generate / Approve / Regenerate → exactly one job transition and one dispatch; a second call gets `ConvexError("BAD_STATE")` and the UI shows the current state. (Tests in Tasks 11 and 14.)
2. **Non-Latin titles.** Hebrew/Russian chapter and lesson titles produce valid, unique, kebab-case slugs (`chapter-2`, `lesson-2-3`) instead of empty strings or collisions. (Task 11.)
3. **Malformed answers.** A test submission with missing answers counts them wrong; option indexes out of range or a non-array answer → `ConvexError("INVALID_ANSWERS")`, no attempt recorded. (Tasks 2 and 4.)
4. **Test changed mid-attempt.** A learner submits against `version` 1 after the admin saved version 2 → `ConvexError("TEST_CHANGED")`, no attempt used; the player reloads the questions. (Tasks 4 and 9.)
5. **Late agent writes.** The watchdog failed a job, then the still-running agent saves a chapter → the save is accepted, the job goes back to `writing`, and an event is logged (Retry must not be blocked by stale state). (Task 12.)

---

## Milestone 1 — Content model and learner experience (no AI)

### Task 1: Workspace and schema

**Files:**
- Create: `convex/lib/engineTypes.ts`, `convex/lib/engineTypes.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces (`convex/lib/engineTypes.ts`): validators `languageValidator`, `lengthValidator` (`short|medium|long`), `slideValidator`, `questionValidator`, `outlineValidator`, `jobStatusValidator` (`queued|researching|outline_ready|writing|ready|failed`), `resourceKindValidator` (`url|pdf|youtube|text`), `readStatusValidator` (`pending|read|embed_only|unreadable`), `sourceKindValidator` (`web|pdf|youtube|text`), `eventKindValidator` (`info|source|outline|chapter|error`); types `Language`, `Length`, `Slide`, `Question`, `PublicQuestion` (= `Omit<Question, "correct" | "explanation">`), `Outline`, `JobStatus` via `Infer`; constants `LENGTH_PRESETS: Record<Length, { chapters: number; minSub: number; maxSub: number }>` = `{ short: {3,2,3}, medium: {5,3,3}, long: {8,3,4} }`, `MAX_CHAPTERS = 10`, `MAX_SUBCHAPTERS = 5`, `TEST_DEFAULTS = { passPercent: 70, maxAttempts: 3 }`, `PDF_MAX_BYTES = 20 * 1024 * 1024`, `RTL_LANGUAGES = ["he"]`.
- Produces (schema): every table and field in the spec's Data model section, including `chapterTests.version`, `testAttempts.testVersion`, `generationJobs.dispatchError`, and `lessons` index `by_chapter_order: ["chapterId", "order"]`.

- [ ] **Step 1:** Create the worktree (superpowers:using-git-worktrees, branch `feat/course-engine`), run `scripts/agent-deployment.sh`, `npm install`, `npx convex dev --once`, `npx convex run seed:run`. Expected: existing `npm test` passes in the worktree.
- [ ] **Step 2: Write the failing test** `engineTypes.test.ts`: `it("length presets respect the caps")` asserts every preset has `chapters <= MAX_CHAPTERS` and `maxSub <= MAX_SUBCHAPTERS`; `it("schema accepts a chaptered course")` inserts course (`language: "he"`), chapter, lesson with `chapterId`, deck with one `bullets` slide, test with one `true_false` question via `convexTest(schema, modules)`.
- [ ] **Step 3:** Run `npx vitest run convex/lib/engineTypes.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 4:** Implement `engineTypes.ts` and the schema additions exactly as the spec's tables (optional fields stay optional so seed courses still validate).
- [ ] **Step 5:** Run the test and `npx convex dev --once` — Expected: PASS, schema pushes to the agent deployment.
- [ ] **Step 6:** Commit `feat(convex): course engine schema and shared validators`.

### Task 2: Grading

**Files:**
- Create: `convex/lib/grading.ts`, `convex/lib/grading.test.ts`

**Interfaces:**
- Produces: `gradeTest(questions: Question[], answers: Record<string, number[]>, passPercent: number): { scorePercent: number; passed: boolean; results: { id: string; correct: boolean }[] }` (throws `ConvexError("INVALID_ANSWERS")` for a non-array answer or an index outside `options`); `publicQuestions(questions: Question[]): PublicQuestion[]`; `validateQuestion(q: Question): string | null` (single/true_false need exactly one correct; multiple ≥ 1; true_false has 2 options; ≥ 2 options otherwise).

- [ ] **Step 1: Write failing tests:** single correct → 100 / passed at 70; multiple with one of two correct chosen → question wrong (all-or-nothing); missing answer counts wrong; 7/10 at 70 → passed, 6/10 → not; index 5 on a 4-option question throws `INVALID_ANSWERS`; `publicQuestions` output has no `correct`/`explanation` keys; `scorePercent` is rounded to an integer.
- [ ] **Step 2:** Run `npx vitest run convex/lib/grading.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement (answer order irrelevant: compare sorted unique arrays).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): chapter test grading`.

### Task 3: Chapters in course queries

**Files:**
- Create: `convex/chapters.ts`, `convex/chapters.test.ts`
- Modify: `convex/courses.ts` (`getBySlug`), `convex/lessons.ts` (`getForViewer`), `convex/lib/access.ts`, `convex/lib/access.test.ts`

**Interfaces:**
- Produces: `canAccessCourseContent({ course: AccessCourse; signedIn; pro; admin }): boolean` (free → signed in, pro → pro or admin, admin → true) in `access.ts`.
- `courses.getBySlug` adds `language` (default `"en"`) and `chapters: { _id, slug, title, summary, order, lessonIds: Id<"lessons">[], hasDeck: boolean, test: { _id, questionCount } | null }[]` (empty array for flat courses).
- `lessons.getForViewer` adds `chapter: { slug, title } | null`, `language`, and `sources: { title, url, kind }[]` (unlocked only).
- `chapters.getForViewer({ courseSlug, chapterSlug })` → `null` | `{ course: { slug, title, language }, chapter: { _id, slug, title, summary, order }, locked: boolean, deck: { slides: Slide[] } | null /* null when locked */, lessons: { slug, title, locked }[], test: { _id, questionCount, passPercent, maxAttempts, best: { scorePercent, passed } | null, attemptsUsed } | null, prev: { slug, title } | null, next: { slug, title } | null }`.

- [ ] **Step 1: Write failing tests** in `chapters.test.ts`: draft course chapter → `null` for a learner, visible for admin; pro course chapter → `locked: true` and `deck: null` for a free user; free course signed out → `locked: true`; signed in → deck slides returned; `getBySlug` on a seeded flat course returns `chapters: []`; lesson `sources` resolved from `sourceIds`.
- [ ] **Step 2:** Run `npx vitest run convex/chapters.test.ts convex/lib/access.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement `canAccessCourseContent`, `chapters.getForViewer`, and the two query extensions.
- [ ] **Step 4:** Run — Expected: PASS (and existing `convex/functions.test.ts` still passes).
- [ ] **Step 5:** Commit `feat(convex): chapters, decks and sources in learner queries`.

### Task 4: Chapter tests API

**Files:**
- Create: `convex/tests.ts`, `convex/tests.test.ts`

**Interfaces:**
- Consumes: `gradeTest`, `publicQuestions` (Task 2), `canAccessCourseContent` (Task 3).
- Produces: `tests.getForViewer({ testId })` → `null` | `{ testId, version, passPercent, maxAttempts, attemptsUsed, best, questions: PublicQuestion[], language }` (requires sign-in; else `null`); `tests.submit({ testId, version, answers: Record<string, number[]> })` → `{ scorePercent, passed, attemptsLeft, results: { id, correct, correctOptions: number[], explanation }[] }` — errors `UNAUTHENTICATED`, `LOCKED`, `TEST_CHANGED` (version mismatch), `NO_ATTEMPTS_LEFT`, `INVALID_ANSWERS`; auto-enrolls like `progress.setComplete`. `tests.resultsForCourse({ courseId })` (admin) → `{ users: { userId, name, email? }[], tests: { testId, chapterTitle }[], cells: { userId, testId, bestScore, passed, attempts }[] }`.

- [ ] **Step 1: Write failing tests:** `getForViewer` payload has no `correct`; submit records an attempt with `testVersion`; 4th attempt with `maxAttempts: 3` → `NO_ATTEMPTS_LEFT`; wrong `version` → `TEST_CHANGED` and no row inserted; bad index → `INVALID_ANSWERS` and no row; best attempt kept after a worse retake; draft course test → `NOT_FOUND` for learner; `resultsForCourse` throws `FORBIDDEN` for non-admin.
- [ ] **Step 2:** Run `npx vitest run convex/tests.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): chapter test attempts and admin results`.

### Task 5: Course completion

**Files:**
- Modify: `convex/progress.ts`, `convex/enrollments.ts` (`listMine`), their tests in `convex/functions.test.ts` (or new `convex/progress.test.ts`)

**Interfaces:**
- Produces: `progress.courseCompletion({ courseId })` → `{ lessonsDone, lessonCount, testsPassed, testCount, complete: boolean }` (signed-out → zeros, `complete: false`). `enrollments.listMine` items gain `testsPassed`, `testCount`, `complete`.

- [ ] **Step 1: Write failing tests:** all lessons done but one test unpassed → `complete: false`; all done and passed → `true`; flat course (no tests) → complete when lessons done.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement (one helper `completionFor(ctx, userId, courseId)` shared by both).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): course completion includes chapter tests`.

### Task 6: Hebrew chaptered seed course

**Files:**
- Modify: `convex/lib/seedData.ts`, `convex/seed.ts`, seed test in `convex/functions.test.ts`

**Interfaces:**
- Produces: `SeedChapteredCourse` type `{ ...SeedCourse minus lessons, language, chapters: { slug, title, summary, slides: Slide[], test: { questions: Question[] }, lessons: SeedLesson[] }[] }` and `seedChapteredCourses` with one free, published Hebrew course (slug `digital-safety-basics`, 2 chapters × 2 lessons, 6 slides and 4 questions per chapter, one `youtube` block, one `quiz` block, Hebrew text).

- [ ] **Step 1: Write failing test:** `seed.run` twice → exactly 2 chapters, 4 lessons with `order` 1–4, 2 decks, 2 tests (`version: 1`) for that course.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement upserts by `(courseId, slug)` for chapters and lessons, by `chapterId` for decks/tests (seed sets `version` only on insert).
- [ ] **Step 4:** Run, then `npx convex run seed:run` on the agent deployment — Expected: PASS.
- [ ] **Step 5:** Commit `feat(seed): Hebrew chaptered demo course`.

### Task 7: Markdown embeds and direction

**Files:**
- Create: `src/components/markdown/embeds.ts`, `embeds.test.ts`, `youtube-embed.tsx`, `resource-card.tsx`, `resource-card.test.tsx`, `convex/resources.ts`, `convex/resources.test.ts`
- Modify: `src/components/markdown/lesson-markdown.tsx`, `lesson-markdown.test.tsx`

**Interfaces:**
- Produces: `parseYoutubeBlock(json: string): { ok: true; embed: { videoId: string; title: string; start?: number } } | { ok: false; error: string }` (videoId must match `/^[\w-]{11}$/`); `parseResourceBlock(json): { ok: true; resourceId: string } | { ok: false; error }`; `YoutubeEmbed` (iframe `https://www.youtube-nocookie.com/embed/<id>?start=<n>`, `title` attr); `ResourceCard({ resourceId })` (client, `useQuery(api.resources.getForViewer)`); `resources.getForViewer({ resourceId })` → `null` | `{ title, kind, url }` (PDF → `ctx.storage.getUrl`; same access rule as course content); `LessonMarkdown({ source, language? })` wraps in `dir="rtl" lang="he"` for `he`, sets `dir="auto"` on `p`/`li`, `dir="ltr"` on code blocks.

- [ ] **Step 1: Write failing tests:** youtube block renders an iframe with the nocookie URL; invalid JSON or bad videoId → the same inline alert as quizzes; `language="he"` → container `dir="rtl"`, code block `dir="ltr"`; `resources.getForViewer` returns `null` for a draft course learner.
- [ ] **Step 2:** Run `npx vitest run src/components/markdown convex/resources.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(markdown): youtube and resource blocks, RTL content`.

### Task 8: Slide deck viewer

**Files:**
- Create: `src/components/chapter/slide-deck.tsx`, `slide.tsx`, `slide-deck.test.tsx`

**Interfaces:**
- Produces: `SlideDeck({ slides: Slide[]; language: Language; title: string })` (client). Renders one slide per layout (`title`, `bullets`, `two-column`, `quote`, `summary`); counter "3 / 8"; Prev/Next buttons and ←/→ keys (mirrored for `he`); "Speaker notes" toggle; Fullscreen button (`requestFullscreen` on the deck region). `Slide({ slide })` is reused by the admin preview (Task 22).

- [ ] **Step 1: Write failing tests:** next/prev buttons and arrow keys move the counter; first slide disables Prev; notes hidden until toggled; `he` → `dir="rtl"` and ArrowLeft advances; each layout renders its fields; UI SDK `createAgent` snapshot names every control and `act` drives Next and the notes toggle.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement with UI SDK wrappers (`src/components/ui/button.tsx`; add a `toggle` wrapper if needed) and existing design tokens.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(ui): slide deck viewer`.

### Task 9: Chapter test player

**Files:**
- Create: `src/components/chapter/chapter-test.tsx`, `chapter-test.test.tsx`, `src/app/courses/[slug]/chapters/[chapterSlug]/test/page.tsx`

**Interfaces:**
- Consumes: `tests.getForViewer`, `tests.submit` (Task 4).
- Produces: `ChapterTest({ testId })` (client): radios for `single`/`true_false`, checkboxes for `multiple`, Submit disabled until every question has an answer, result view with score, passed/failed, per-question correct/incorrect + explanation, "Try again (N left)" or "No attempts left"; on `TEST_CHANGED` shows "This test was updated" and refetches; signed-out → sign-in prompt.

- [ ] **Step 1: Write failing tests** (mock `convex/react`): submit sends `{ testId, version, answers }`; result shows explanations; `TEST_CHANGED` path; attempts exhausted hides Try again; RTL for `he`; `createAgent` test answers and submits.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement component and page (page resolves `testId` via `chapters.getForViewer`).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(ui): chapter test player`.

### Task 10: Chapter page, chaptered outline, completion

**Files:**
- Create: `src/app/courses/[slug]/chapters/[chapterSlug]/page.tsx`, `src/components/chapter/chapter-view.tsx`, `chapter-view.test.tsx`, `src/components/lesson/lesson-sources.tsx`, `e2e/chapters.spec.ts`, `docs/features/course-engine.md`
- Modify: `src/components/course/course-detail.tsx`, `lesson-outline.tsx` (+ test), `src/components/lesson/lesson-view.tsx`, `src/components/course/dashboard-courses.tsx`, `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: Tasks 3, 5, 7, 8, 9.
- Produces: chapter page (deck, lesson list, test card with best score/attempts); course outline grouped by chapter (deck · lessons · test per chapter) when `chapters.length > 0`, flat otherwise; lesson view passes `language` to `LessonMarkdown` and renders `LessonSources` ("Sources" list with external links) under the body; dashboard shows "Complete" when `complete`.

- [ ] **Step 1: Write failing tests:** outline groups lessons under chapter headings; flat course unchanged (existing tests still pass); chapter view renders deck and test card; E2E `chapters.spec.ts`: signed-out visitor opens `/courses/digital-safety-basics`, sees two chapter groups, opens chapter 1, sees the deck locked with a sign-in prompt (free course requires sign-in).
- [ ] **Step 2:** Run unit tests — Expected: FAIL.
- [ ] **Step 3:** Implement; write `docs/features/course-engine.md` (learner side) and update ARCHITECTURE (row 11 "In progress", data model tables, routes).
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm test && npm run test:e2e` — Expected: all PASS.
- [ ] **Step 5:** Commit `feat: chapter pages, chaptered outline and course completion`.

## Milestone 2 — Admin generation shell

### Task 11: Generation jobs (admin Convex API)

**Files:**
- Create: `convex/generation.ts`, `convex/generation.test.ts`, `convex/lib/slugs.ts`, `convex/lib/slugs.test.ts`

**Interfaces:**
- Produces: `chapterSlug(order: number): string` → `chapter-<order>`; `lessonSlug(chapterOrder, subOrder): string` → `lesson-<c>-<s>`; `courseSlugFor(title: string, existing: Set<string>): string` (Latin kebab from title if ≥ 3 chars after stripping non-`[a-z0-9]`, else `course-<6 hex>`; suffix `-2`, `-3` on collision).
- Admin functions (all `requireAdmin`): `createJob({ topic, language, level, length, audience?, notes? })` → `Id<"generationJobs">`; `generateUploadUrl()`; `addResource({ jobId, kind, url?, storageId?, text?, title? })` (only in `queued`; PDF size checked via `ctx.db.system.get(storageId)` ≤ `PDF_MAX_BYTES`, YouTube URL must yield an 11-char id) → `Id<"courseResources">`; `removeResource({ resourceId })`; `get({ jobId })`, `list()`, `events({ jobId })` (latest 200, ascending); `updateOutline({ jobId, outline })` (only `outline_ready`; enforces caps); `approveOutline({ jobId })` → `courseId` (only `outline_ready`; creates draft course with `language`, `tier: "free"`, chapters with `chapterSlug`, empty lessons with global `order`, `lessonSlug`, `body: ""`, `isFreePreview: false`, `durationMinutes: 0`; attaches resources `courseId`; status `writing`); `markDispatched({ jobId, eveSessionId })`, `markDispatchError({ jobId, error })`.
- Internal helper `transition(ctx, job, from: JobStatus[], to: JobStatus)` throws `ConvexError("BAD_STATE")`.

- [ ] **Step 1: Write failing tests:** non-admin → `FORBIDDEN`; `approveOutline` twice → second throws `BAD_STATE`, one course; Hebrew-only course title → `course-xxxxxx`; 3 chapters × 2 subchapters → lessons `order` 1–6 and slugs `lesson-1-1…lesson-3-2`; outline with 11 chapters rejected; PDF over 20 MB rejected; `addResource` after `queued` → `BAD_STATE`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): generation jobs, resources and outline approval`.

### Task 12: Engine HTTP API

**Files:**
- Create: `convex/engine.ts` (internal queries/mutations), `convex/engine.test.ts`, `convex/lib/engineAuth.ts`, `convex/lib/sourceScan.ts`, `convex/lib/sourceScan.test.ts`
- Modify: `convex/http.ts`

**Interfaces:**
- Produces: `checkEngineSecret(header: string | null, secret: string | undefined): boolean` (constant-time; `false` when secret unset); `findUnknownRefs(markdown: string, known: { urls: Set<string>; videoIds: Set<string>; resourceIds: Set<string> }): string[]` (scans http(s) URLs in links and bare text, `youtube` block `videoId`s, `resource` block ids; URLs compared after stripping trailing `/` and `#fragment`). The known sets for a job: `urls` = all `generationSources.url` + admin resource URLs; `videoIds` = IDs from admin YouTube resources + `youtube`-kind sources the agent found; `resourceIds` = the job's `courseResources`.
- HTTP: `http.route({ pathPrefix: "/engine/", method: "POST", handler })`. 401 on bad secret, 404 unknown op, 400 `{ ok: false, error }` on validation or `ConvexError`, 200 `{ ok: true, ...result }`. Ops and bodies:
  - `getJob { jobId }` → `JobBrief` = `{ jobId, status, topic, language, level, length, audience?, notes?, resources: { id, kind, title, url?, fileUrl?, text?, readStatus }[], sources: { id, url, title, kind }[], outline?: Outline, course?: { courseId, chapters: { order, title, summary, subchapters: { order, title, hasBody: boolean }[], hasDeck, hasTest }[] } }`
  - `setResourceStatus { jobId, resourceId, readStatus, title? }`
  - `saveSources { jobId, sources: { url, title, kind, resourceId?, excerpt? }[] }` → `{ sources: { id, url }[] }` (upsert by `(jobId, url)`)
  - `saveOutline { jobId, outline }` (from `researching` → `outline_ready`)
  - `reportProgress { jobId, kind, message, chapterOrder? }`
  - `saveSubchapter { jobId, chapterOrder, subchapterOrder, title, summary, body, durationMinutes, sourceIds }` (rejects unknown `sourceIds` and any `findUnknownRefs` hit: `"Unknown reference: <ref>"`)
  - `saveDeck { jobId, chapterOrder, slides }` (6–12 slides)
  - `saveTest { jobId, chapterOrder, questions }` (8–10 questions, each `validateQuestion`; upsert bumps `version` when content changes)
  - `finishJob { jobId }` (→ `ready`; refuses if any lesson body is empty or a deck/test is missing, listing what's missing), `failJob { jobId, error }`
  - Every write inserts a `generationEvents` row; a write to a `failed` job sets status back to its phase (`writing` after approval, else `researching`) and logs "Resumed".

- [ ] **Step 1: Write failing tests:** missing/wrong secret → 401; replaying `saveSubchapter` → one lesson, same `_id`; foreign `sourceId` → 400; markdown with an unseen URL → 400 naming it; `saveTest` with a `single` question with two correct → 400; `finishJob` with a missing deck → 400 listing chapter; save on `failed` job → status `writing` + "Resumed" event; `findUnknownRefs` unit cases (trailing slash, fragment, youtube id, resource id).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement; set `COURSE_ENGINE_SECRET` on the agent deployment and in `.env.local`.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): secret-guarded engine HTTP API with source integrity`.

### Task 13: Watchdog

**Files:**
- Create: `convex/crons.ts`
- Modify: `convex/engine.ts`, `convex/engine.test.ts`

**Interfaces:**
- Produces: `engine.failStalledJobs` (internal mutation, `now` from `Date.now()`), scheduled `crons.interval("fail stalled generation jobs", { minutes: 5 }, …)`; fails `researching`/`writing` jobs whose latest event (or `updatedAt`) is older than 15 minutes, with `error: "No progress for 15 minutes"`.

- [ ] **Step 1: Write failing test** with `vi.useFakeTimers()`: job with last event 16 min ago → `failed`; 10 min ago → unchanged; `outline_ready` never failed.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): fail stalled generation jobs`.

### Task 14: Dispatch routes and fake engine

**Files:**
- Create: `src/lib/course-builder/commands.ts`, `commands.test.ts`, `src/lib/course-builder/dispatch.ts`, `dispatch.test.ts`, `src/lib/course-builder/fake-engine.ts`, `fake-engine.test.ts`, `src/lib/course-builder/engine-http.ts`, `src/app/api/course-builder/[action]/route.ts`, `route.test.ts`

**Interfaces:**
- Produces: `type EngineCommand = { action: "research"; jobId } | { action: "write"; jobId } | { action: "regenerate"; jobId; target: { kind: "subchapter" | "deck" | "test" | "chapter"; chapterOrder: number; subchapterOrder?: number }; instruction: string }`; `commandMessage(cmd: EngineCommand): string` (one human-readable line + a fenced `json` block with the command; deterministic). `engineHttp(op: string, body: unknown): Promise<unknown>` (server-only fetch to `${CONVEX_SITE_URL}/engine/${op}` with the secret; throws on `ok: false`). `dispatch(cmd, { sessionId? }): Promise<{ sessionId: string }>` — `fake` mode runs `runFakeEngine(cmd)` (writes a canned 2-chapter course through `engineHttp`, returns `fake-<jobId>`); `live` mode calls eve (Task 17 fills `sendToAgent`; until then live throws `"course-builder agent not configured"`).
- Route `POST /api/course-builder/[action]` for `start | approve | regenerate | resume`: Clerk `auth()` + admin role check (403), Convex token via `auth().getToken()` and `ConvexHttpClient`; `start` → (job must be `queued`) dispatch research; `approve` → `generation.approveOutline` then dispatch write; `regenerate` → dispatch regenerate; `resume` → re-dispatch the command for the job's status. On dispatch success `markDispatched`; on failure `markDispatchError` and 502.

- [ ] **Step 1: Write failing tests:** `commandMessage` round-trips via a `parseCommand` regex; route returns 403 for non-admin (mock `@clerk/nextjs/server`); second `approve` returns 409 from `BAD_STATE`; dispatch failure records `dispatchError`; fake engine produces a job in `ready` through mocked `engineHttp` calls in the documented order.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement (read `node_modules/next/dist/docs/` route handler guide first). **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: course-builder dispatch routes and fake engine`.

### Task 15: Admin generation UI

**Files:**
- Create: `src/app/admin/generate/page.tsx`, `src/app/admin/generate/[jobId]/page.tsx`, `src/components/generate/generate-form.tsx` (+ test), `resource-inputs.tsx` (+ test), `job-live-view.tsx` (+ test), `outline-editor.tsx` (+ test), `jobs-list.tsx`
- Modify: `src/app/admin/page.tsx`, `docs/features/course-engine.md`, `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: Task 11 functions, Task 14 routes.
- Produces: wizard (topic required 3–200 chars; language select English/עברית/Русский; level; length with preset description; audience; notes; resources: add URL, YouTube URL, paste text, upload PDF via `generateUploadUrl`), **Generate** → `createJob` + `addResource`s + `POST /api/course-builder/start` → navigate to live view. Live view: stepper (Research → Outline → Writing → Ready), event feed, sources list, per-chapter cards during writing; `outline_ready` → `OutlineEditor` (rename, reorder ↑↓, add/remove chapter and subchapter, edit goals; Save → `updateOutline`; **Approve and write** → `/approve`); `failed` → error + **Retry phase** (`/resume`); `dispatchError` → **Resume**; `ready` → link to `/admin/courses/<courseId>`. Buttons disable while a request is in flight.

- [ ] **Step 1: Write failing tests:** form blocks empty topic; PDF over 20 MB rejected client-side; live view shows the right controls per status (fixtures for each status); outline editor enforces 10/5 caps and disables Approve while saving; `createAgent` tests for form and outline editor.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run all checks; manual run with `COURSE_ENGINE_MODE=fake`: generate → outline → approve → ready → draft course opens — Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): course generation wizard, live view and outline editor`.

## Milestone 3 — Agent: research and outline

### Task 16: eve spike (throwaway)

**Files:** scratch branch `spike/course-builder` only; findings into `docs/features/course-engine.md` on the main branch.

- [ ] **Step 1:** Read `node_modules/eve/docs/subagents/index.mdx`, `tools/workflows.mdx`, `concepts/execution-model-and-durability.mdx`, `guides/auth-and-route-protection.md`, `guides/frontend/nextjs.mdx`.
- [ ] **Step 2:** Prove, in ≤ half a day: (a) a second message resumes the same session after restarting `eve dev`; (b) a workflow tool fans out 10 trivial subagents with `Promise.all` and collects 10 results; (c) a tool returns a PDF (fetched by URL, base64) via `toolOutputPart.file` and the model quotes its first line; (d) a `jwtHmac` channel accepts a token signed with `COURSE_BUILDER_CHANNEL_SECRET` and rejects others.
- [ ] **Step 3:** Record pass/fail per item with numbers (durations) in `docs/features/course-engine.md`. If (b) or (c) fails without a workaround, stop and report to the owner before Task 17 (fallback: approach B for that part).
- [ ] **Step 4:** Commit the findings doc only: `docs: course-builder eve spike results`.

### Task 17: Agent scaffold and live dispatch

**Files:**
- Create: `agents/course-builder/agent/agent.ts`, `agent.test.ts`, `instructions.md`, `channels/eve.ts`, `lib/engine-client.ts`, `lib/engine-client.test.ts`, `lib/command.ts`, `lib/command.test.ts`, `agents/course-builder/evals/evals.config.ts`, `src/lib/course-builder/eve-client.ts`
- Modify: `src/lib/course-builder/dispatch.ts`, `package.json` (`dev:course-builder`, `build:course-builder`, `info:course-builder`, `eval:course-builder`; `dev:all` adds the agent), `playwright.config.ts` (`build:course-builder` before `build`)

**Interfaces:**
- Produces: `createEngineClient({ baseUrl: string; secret: string; fetch?: typeof fetch }): EngineClient` with one method per Task 12 op (same names, typed with `JobBrief`, `Outline`, `Slide`, `Question` from `convex/lib/engineTypes.ts`), throwing `EngineError(message)` on `ok: false`; `engineFromEnv(): EngineClient` (`CONVEX_SITE_URL` or derived from `NEXT_PUBLIC_CONVEX_URL` by replacing `.convex.cloud` with `.convex.site`, `COURSE_ENGINE_SECRET`). `parseCommand(text: string): EngineCommand | null` (agent side; mirror of Task 14's format). `sendToAgent(cmd, sessionId?): Promise<{ sessionId }>` in `eve-client.ts` (HS256 JWT, `sub: "course-builder-route"`, `principalType` service, 60 s expiry; new session via `sessions.create`, follow-up via the session's message endpoint; if the session is unknown/stranded, create a new one).
- Channel: `jwtHmac` with `COURSE_BUILDER_CHANNEL_SECRET`; no browser access.

- [ ] **Step 1: Write failing tests:** engine client sends `Authorization: Bearer <secret>` to `<base>/engine/saveOutline` and throws `EngineError` on `{ ok: false }`; `parseCommand(commandMessage(cmd))` deep-equals `cmd` for all three actions; site URL derivation.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement; `npm run info:course-builder` shows no diagnostics. **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat(agent): course-builder scaffold, channel auth and engine client`.

### Task 18: Research tools and outline

**Files:**
- Create in `agents/course-builder/agent/tools/`: `get_job.ts`, `read_resource.ts`, `youtube_info.ts`, `web_search.ts`, `web_fetch.ts`, `save_sources.ts`, `save_outline.ts`, `report_progress.ts`, `tools.test.ts`
- Modify: `agents/course-builder/agent/instructions.md`

**Interfaces:**
- Consumes: `engineFromEnv` (Task 17). Tools take `jobId` from input and return `{ ok: false, message }` instead of throwing on `EngineError`.
- Produces: `read_resource { jobId, resourceId }` → URL: eve fetch text (truncate 60 000 chars); PDF: fetch `fileUrl`, base64, return via `toModelOutput` `toolOutputPart.file(…, { mediaType: "application/pdf" })`; over 20 MB or fetch failure → `setResourceStatus unreadable`; text: as is; YouTube → `embed_only` with oEmbed title/channel. `youtube_info { url }` → `{ videoId, title, channel }`. `web_search`/`web_fetch` re-enable eve built-ins (see `concepts/built-in-tools.md`). `save_outline` validates caps for the job's `length` before calling the engine.
- `instructions.md` research section: read every resource first, then search; prefer primary/official sources; save each used source; outline matches the length preset; titles and goals in the course language; report progress after each resource and after the outline.

- [ ] **Step 1: Write failing tests** with a fake `EngineClient` and mocked `fetch`: PDF over cap marks `unreadable`; YouTube resource marked `embed_only` with oEmbed title; `save_outline` rejects 6 chapters for `short`; engine error surfaces as `{ ok: false }`.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run; manual: `COURSE_ENGINE_MODE=live`, generate "Basics of personal budgeting" (en, short) with one URL and one PDF → outline appears in the live view with sources — Expected: PASS.
- [ ] **Step 5:** Commit `feat(agent): research tools and outline phase`.

## Milestone 4 — Agent: writing

### Task 19: chapter-writer subagent

**Files:**
- Create: `agents/course-builder/agent/subagents/chapter-writer/agent.ts`, `instructions.md`, `tools/save_subchapter.ts`, `tools/save_deck.ts`, `tools/save_test.ts`, `tools/report_progress.ts`, `tools/tools.test.ts`, `agents/course-builder/agent/lib/writer-brief.ts`, `writer-brief.test.ts`

**Interfaces:**
- Produces: `buildWriterBrief(job: JobBrief, chapterOrder: number): string` (course topic, audience, level, language, the chapter's title/goal and subchapter titles/goals, the sources list `[id] title — url — excerpt`, resources eligible for embedding with their ids/videoIds, the rules); writer output schema `{ chapterOrder: number; saved: { subchapters: number; deck: boolean; test: boolean }; problems: string[] }`.
- `instructions.md` (writer): language rules; 1–3 `quiz` blocks per subchapter (existing JSON format); `[n]` citations map to `sourceIds`; embeds only from the brief; 6–12 slides with 2–4 sentence notes; 8–10 test questions answerable from this chapter, mixed kinds, localized True/False labels; on a save error, fix and retry the save (max 2 retries), then list it in `problems`.

- [ ] **Step 1: Write failing tests:** brief contains every subchapter goal and only this chapter's resources; save tools pass `chapterOrder`/`subchapterOrder` through and return `{ ok: false, message }` with the engine's "Unknown reference" text.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(agent): chapter-writer subagent`.

### Task 20: write_course, finish, regenerate

**Files:**
- Create: `agents/course-builder/agent/tools/write_course.ts`, `finish_job.ts`, `regenerate.ts`, `write-course.test.ts`, `agents/course-builder/evals/tiny-course.eval.ts`
- Modify: `agents/course-builder/agent/instructions.md`, `docs/features/course-engine.md`

**Interfaces:**
- Consumes: Tasks 17–19.
- Produces: `write_course { jobId, chapterOrders?: number[] }` — workflow tool: loads `getJob`, runs `ctx.agent("chapter-writer").send(buildWriterBrief(job, n), { outputSchema, signal: ctx.abortSignal })` for each chapter (all, or only `chapterOrders`) in `Promise.all`, reports a `chapter` event per result, returns a summary; `finish_job { jobId }` → engine `finishJob` (on refusal returns the missing list so the agent re-runs `write_course` for those chapters once). `regenerate { jobId, target, instruction }`: `chapter` → `write_course` for one chapter; `subchapter`/`deck`/`test` → one writer call with the brief plus "Only redo <target>: <instruction>".
- Root `instructions.md`: on a `research` command run the research phase; on `write` call `write_course` then `finish_job`; on `regenerate` call `regenerate`; always start with `get_job`; never invent `jobId`.

- [ ] **Step 1: Write failing tests** with a stubbed `ctx.agent`: 3 chapters → 3 parallel sends; `chapterOrders: [2]` → one send; one writer reporting `problems` still lets the others save; `finish_job` refusal returns missing chapters.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement; eval `tiny-course.eval.ts` (1 chapter, fake engine, asserts deck/test/subchapters saved) — run manually with `npm run eval:course-builder`, note the token cost in the doc. **Step 4:** Run unit tests; manual live run of the Task 18 job through to `ready` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(agent): parallel chapter writing, finish and regenerate`.

## Milestone 5 — Admin review

### Task 21: Admin editing API

**Files:**
- Modify: `convex/admin.ts`, `convex/admin.test.ts`

**Interfaces:**
- Produces (all `requireAdmin`): `listChapters({ courseId })`; `updateChapter({ chapterId, title?, summary? })`; `updateDeck({ chapterId, slides })` (6–20 slides when edited by hand); `updateTest({ chapterId, questions?, passPercent?, maxAttempts? })` (validates with `validateQuestion`, bumps `version` when `questions` change); `getDeck`, `getTest` (full, incl. `correct`); `updateCourse` accepts `language`. Publishing uses the existing `updateCourse({ status })`.

- [ ] **Step 1: Write failing tests:** `updateTest` with changed questions bumps version, unchanged settings-only edit does not; invalid question rejected; non-admin `FORBIDDEN`.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(convex): admin editing for chapters, decks and tests`.

### Task 22: Admin review UI

**Files:**
- Create: `src/components/admin/chapters-panel.tsx` (+ test), `deck-editor.tsx` (+ test), `test-editor.tsx` (+ test), `regenerate-dialog.tsx` (+ test), `results-table.tsx` (+ test)
- Modify: `src/components/admin/course-editor.tsx`, `course-form.tsx` (language select), `src/app/admin/courses/[courseId]/page.tsx`, `docs/features/course-engine.md`, `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: Task 21, Task 4 `resultsForCourse`, Task 14 `/api/course-builder/regenerate`, `Slide` (Task 8) for preview.
- Produces: course editor tabs **Content** (chapters with their lessons, deck and test; existing lesson editor reused), **Results**. Deck editor: slide list, layout select, fields per layout, notes, reorder, add/delete, live `Slide` preview. Test editor: questions with kind, prompt, options, correct toggles, explanation; pass mark and attempts; warning "Saving changes question content creates a new version". Regenerate dialog on lesson/deck/test/chapter: instruction textarea (required, ≤ 500 chars) → route; shows "Regenerating…" from the job's events. Results table: learners × chapter tests (best %, ✓/✗, attempts).

- [ ] **Step 1: Write failing tests:** deck editor add/reorder/delete updates the payload sent to `updateDeck`; test editor blocks saving a `single` question with two correct answers; regenerate dialog requires an instruction and posts `{ jobId, target, instruction }`; results table renders a pass and a fail cell; `createAgent` tests for deck and test editors.
- [ ] **Step 2:** Run — Expected: FAIL. **Step 3:** Implement. **Step 4:** Run all four checks — Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): deck and test editors, regenerate and results`.

## Milestone 6 — Demo run

### Task 23: Local demo in three languages

**Files:**
- Modify: `docs/features/course-engine.md`, `docs/ARCHITECTURE.md` (row 11 → Done with commit)

- [ ] **Step 1:** With the owner's topics, generate one `short` course each in en, he, ru from live inputs (one URL, one PDF, one YouTube link). Approve outlines, let writing finish, publish.
- [ ] **Step 2:** As a non-admin learner: open each course, view a deck, finish a lesson, pass and fail a test; as admin check Results.
- [ ] **Step 3:** Record per course: research and writing durations, token usage (if available), regenerations needed, issues found. Fix blocking issues as separate commits with tests.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm test && npm run test:e2e` — Expected: PASS.
- [ ] **Step 5:** Commit `docs: course engine demo results`, then use superpowers:finishing-a-development-branch.
