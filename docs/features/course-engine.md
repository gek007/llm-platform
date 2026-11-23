# Course engine (learner side)

Spec: [course-engine-design](../superpowers/specs/2026-11-23-course-engine-design.md). The first half covers what learners see; "Admin generation" covers the admin flow. The `course-builder` agent arrives in a later milestone (until then `COURSE_ENGINE_MODE=fake` stands in for it).

## Chaptered courses

A course with rows in `chapters` is chaptered; lessons keep a global `order` and group via `lessons.chapterId`. Courses without chapters render as before (flat lesson list). Each chapter has at most one slide deck (`slideDecks`) and one test (`chapterTests`).

- **Course page** (`/courses/[slug]`): when `chapters.length > 0` the outline is grouped by chapter. Each group shows the chapter link, Slides (if a deck exists), the lessons and a "Chapter test" link.
- **Chapter page** (`/courses/[slug]/chapters/[chapterSlug]`, `src/components/chapter/chapter-view.tsx`): slide deck, lesson list, test card (question count, pass percent, best score, attempts used of max) and previous/next chapter links. Draft courses are admin-only.
- **Deck viewer** (`slide-deck.tsx`): Prev/Next, arrow keys on the focused deck, speaker notes toggle, fullscreen; position resets per chapter. The deck is locked (`deck: null`) when the viewer cannot access the course content; signed-out visitors see a sign-in prompt, signed-in non-Pro viewers of a Pro course see an upgrade link.
- **Lesson page**: passes the course `language` to the markdown renderer and lists the lesson's sources ("Sources", external links) under the body.

## Chapter tests

Page: `/courses/[slug]/chapters/[chapterSlug]/test` (`chapter-test.tsx`). Kinds: `single`, `multiple` (all-or-nothing), `true_false`. Defaults: pass at 70%, 3 attempts. The best attempt decides `passed`. `correct` and `explanation` are returned only after a submission. Submitting takes `{ testId, version, answers }`; if the test changed meanwhile the learner is told it was updated and no attempt is used. Editing a test bumps `version`; earlier passes still count.

## Completion

A course is complete when every lesson is complete and every chapter test is passed (`progress.courseCompletion`; `enrollments.listMine` carries `testsPassed`, `testCount`, `complete`). The dashboard card shows a "Complete" badge when `complete` is true.

## Right-to-left

Hebrew (`he`) is the only RTL language. Content containers (course description, chapter heading and summary, lesson list, slide deck, tests, lesson body) get `dir="rtl" lang="he"`; code blocks stay LTR; app chrome stays English.

## Seed course

`digital-safety-basics`: free, published, Hebrew, 2 chapters x 2 lessons (`chapter-1`, `chapter-2`), each with a 6-slide deck and a 4-question test (the 8-10 questions / 6-12 slides rule applies only to engine-generated content). It is created by `npx convex run seed:run` and used by `e2e/chapters.spec.ts` (signed-out: two chapter groups, deck locked with a sign-in prompt).

Signed-in end-to-end flows are not covered yet (no Clerk testing tokens); unit and component tests cover the chapter view, outline, sources and course card.

## Admin generation

Admin-only pages (the admin layout gates them; Convex re-checks with `requireAdmin`).

- **Wizard** (`/admin/generate`, `src/components/generate/generate-form.tsx`): topic (required, 3 to 200 characters), language (English / עברית / Русский), level, length preset (short 3 x 2-3, medium 5 x 3, long 8 x 3-4; shown under the select), optional audience and notes, and resources: web URL, YouTube URL (embed-only), pasted text, PDF upload (20 MB, rejected client-side and again by `addResource`). **Generate** runs `createJob`, one `addResource` per resource (PDFs upload via `generateUploadUrl` first), then `POST /api/course-builder/start`, then opens the live view. The button disables while the request runs.
- **Live view** (`/admin/generate/[jobId]`, `job-live-view.tsx`): reactive over `generation.get`, `events` and `sources`. Stepper Research, Outline, Writing, Ready; activity feed; sources list; per-chapter cards while writing (latest event for that chapter).
- **Jobs list**: `/admin` shows all jobs (`generation.list`) under the courses table; "Generate with AI" opens the wizard.

### Statuses and controls

| Status | UI |
| ------ | -- |
| `queued` | Waiting; **Start** (normally the wizard already started it) |
| `researching` | Feed and sources only |
| `outline_ready` | Outline editor: rename, reorder, add/remove chapters (max 10) and subchapters (max 5), edit goals; **Save outline** (`updateOutline`) and **Approve and write** (saves unsaved edits, then `POST /approve`). Field values hold course-language content, so they use `dir="auto"` |
| `writing` | Chapter cards, feed |
| `ready` | **Open draft course** (`/admin/courses/<courseId>`) |
| `failed` | Error and **Retry phase** (`POST /resume`) |
| any, with `dispatchError` | Error and **Resume** (the engine could not be reached) |

A 409 from a route (double click, or another tab acted first) shows "already <status>" and the reactive query refreshes the view; a 502 means dispatch failed and the job gets `dispatchError`.

### Engine API and modes

`POST /api/course-builder/{start|approve|regenerate|resume}` (`src/app/api/course-builder/[action]/route.ts`) re-checks the admin, runs the Convex transition (`startJob`, `approveOutline`, `requestRegenerate`) and dispatches the command to the engine. `COURSE_ENGINE_MODE=fake|live` (Next.js env, default `live`): `fake` runs a canned engine that calls the same `/engine/*` endpoints with the same validation, so the whole flow works without the agent or an Anthropic key. The agent (and the fake engine) write through the Convex HTTP surface `POST <CONVEX_SITE_URL>/engine/<op>` (`convex/http.ts`), authenticated with `Authorization: Bearer <COURSE_ENGINE_SECRET>` (constant-time check in `convex/lib/engineAuth.ts`; fails closed when unset). Ops live in `convex/engine.ts`: `getJob`, `setResourceStatus`, `saveSources`, `saveOutline`, `reportProgress`, `saveSubchapter`, `saveDeck`, `saveTest`, `finishJob`, `failJob`.

### Watchdog

`convex/crons.ts` runs `engine.failStalledJobs` every 5 minutes; a `researching` or `writing` job with no update for 15 minutes becomes `failed` ("stalled"). A late write from the agent on such a job is accepted, the job returns to `writing` and an event is logged.

### Source integrity

`convex/lib/sourceScan.ts` parses lesson markdown the way the renderer does. Every http(s) link must be a source the engine saved (`saveSources`, from pages it read); unknown URLs, including raw URLs in slide and test text, are rejected with "Unknown reference: <ref>". ```youtube / ```resource blocks must reference saved resources; pasted-text resources cannot be cited as `[n]`. Engine saves are accepted only in `writing` (or `failed`, which resumes) and are refused with `BAD_STATE` "Course is published; unpublish it to let the engine write" once the course is published. Regenerating a published course is likewise refused ("Unpublish the course to regenerate"), so AI content never lands in a live course.
