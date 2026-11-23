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

### Live dispatch (course-builder agent)

In `live` mode `dispatch` calls `sendToAgent` (`src/lib/course-builder/eve-client.ts`): `POST <COURSE_BUILDER_URL>/v1/session {message}` for a new session, `POST .../v1/session/<id>` for a follow-up, where the message is `commandMessage(cmd)` and each request carries a fresh HS256 JWT (`iss: llm-platform`, `aud: course-builder`, `sub: course-builder-route`, 60 s expiry) signed with `COURSE_BUILDER_CHANNEL_SECRET`; eve treats it as a `service` principal. `start` always opens a new session; `approve`, `regenerate` and `resume` follow up on the job's stored `eveSessionId`. A follow-up answered 409 (session not active) or 500 (stranded after a plain `eve dev` restart) is re-sent as a new session and the route stores the new id; any other failure is thrown and recorded as `dispatchError` (the live view offers **Resume**). `COURSE_BUILDER_URL` defaults to `http://127.0.0.1:2001/eve`, the `npm run dev:course-builder` server.

The agent (`agents/course-builder/`) reads and writes only through `/engine/*` with `createEngineClient` / `engineFromEnv` (`CONVEX_SITE_URL`, else `NEXT_PUBLIC_CONVEX_SITE_URL`, else `NEXT_PUBLIC_CONVEX_URL` with `.convex.cloud` -> `.convex.site`; `COURSE_ENGINE_SECRET`); a failed op throws `EngineError` with the server's whole `"CODE: detail"` string. `getJob` returns `JobBrief` (`convex/lib/engineTypes.ts`).

### Research tools (course-builder agent)

The research phase runs on these tools in `agents/course-builder/agent/tools/`; each takes the command's `jobId` and answers `{ ok: false, message }` (the engine's `"CODE: detail"`) instead of throwing when the engine refuses a call:

- `get_job`: the `JobBrief`.
- `read_resource { jobId, resourceId }`: URL → readable text (HTML stripped, `<main>`/`<article>` preferred, truncated to 60 000 characters); PDF → the Convex storage file as base64, given to the model as a `toolOutputPart.file(..., { mediaType: "application/pdf" })` part, only within the model budgets in `lib/pdf.ts` (at most 100 pages, estimated from page objects incl. compressed object streams; 10 MB per PDF; 15 MB for all PDFs read in the job), otherwise `unreadable` with the reason ("the PDF has 142 pages; the model accepts up to 100"); pasted text → as is; all three are marked `read`. YouTube → `embed_only` with the oEmbed title and channel (the platform's "YouTube video" placeholder title is replaced with the real one); never a transcript. A failed fetch, a PDF over 20 MB (`PDF_MAX_BYTES`) or a non-PDF file marks the resource `unreadable` and logs the reason as a `source` progress event.
- `youtube_info { url }` → `{ videoId, title, channel }` (`lib/youtube.ts`; the oEmbed URL is built from the parsed video ID).
- `web_search` (eve built-in; the direct Anthropic model gets Anthropic's native search) and `web_fetch` (eve built-in: https only, every hop of up to 10 redirects SSRF-checked including at connect time, 5 MB cap), re-enabled because the agent sets `defaultTools: false`.
- `save_sources` (refuses any URL equal to or on the host of a job resource's `fileUrl`, or a Convex `/api/storage/` path: admin PDFs stay behind access-checked ```resource blocks and are never public sources), `save_outline` (checks the job's length preset before calling the engine: short = exactly 3 chapters of 2-3 subchapters, medium = 5 of 3, long = 8 of 3-4; caps 10/5), `report_progress` (`lib/report-progress.ts` `makeReportProgressTool`, shared with the chapter-writer).

**Fetch safety** (`lib/safe-fetch.ts`, used for pages, PDFs and oEmbed): https only on every hop; at most 3 redirects, each re-validated; destinations go through `guarded-fetch` (direct dependency, pinned): IP literals in any spelling (decimal, octal, hex, IPv4-mapped, NAT64, 6to4, Teredo) and resolved hostnames are refused when private, loopback, link-local (cloud metadata), CGNAT, ULA or reserved, `localhost`/`*.localhost`/`*.local` by name, and the address is re-checked inside the socket's DNS lookup (DNS rebinding); streamed byte caps (PDF 20 MB, text 5 MB, JSON 256 KB) abort past the cap; Content-Type must match and a PDF must start with `%PDF-`; the turn's abort signal and a per-kind timeout (PDF 90 s, page 30 s, oEmbed 15 s) bound the whole fetch, body included. Convex storage `fileUrl`s take the same path (public https, so they pass; caps still apply).

### Chapter writer (course-builder agent)

`agents/course-builder/agent/subagents/chapter-writer/` writes one chapter per run (`claude-opus-5-5`, `reasoning: "high"`, `defaultTools: false`, `tool: false`: only the write fan-out reaches it). Its message is `buildWriterBrief(job, chapterOrder)` (`lib/writer-brief.ts`): jobId, topic, language (with the localized True/False labels: en "True"/"False", he "נכון"/"לא נכון", ru "Верно"/"Неверно"), level, audience, notes, the chapter and each subchapter's title and goal (from the course rows: `getJob` returns each lesson's `summary`, which approval sets to the outline goal and which follows the admin's renames and reorders), every saved source as `[id] title — url — excerpt` (`getJob` returns the excerpt `save_sources` stored; the brief shows its first 1,500 characters; YouTube sources also get a ready ```youtube block), and the admin resources planned for this chapter (`resourceIds`, only in the frozen outline) as ready-to-paste blocks: PDFs, pasted text and URLs as ```resource, YouTube as ```youtube. A planned resource goes to the lesson with exactly the same title as its outline subchapter; one whose outline subchapter matches no lesson is offered at chapter level ("planned for '<outline title>'") for the writer to place, never on a neighbour by position. Unreadable ones and other chapters' resources are left out, and storage URLs never appear. Writers cite `[n]` only for what a source's excerpt (or title) supports and use `quote` slides only for text copied word for word from an excerpt or pasted-text preview in the brief. Citation rule: `[n]` in a lesson body is the n-th id in that `save_subchapter` call's `sourceIds`. Tools `save_subchapter`, `save_deck` (6-12 slides), `save_test` (8-10 questions) pass their input straight to the engine and answer `{ ok: false, message }` with the engine's text ("Unknown reference: X", "INVALID: …"); the writer retries a failed save at most twice, then lists it in `problems`. It answers with `writerOutputSchema`: `{ chapterOrder, saved: { subchapters, deck, test }, problems }`.

### Watchdog

`convex/crons.ts` runs `engine.failStalledJobs` every 5 minutes; a `researching` or `writing` job with no update for 15 minutes becomes `failed` ("stalled"). A late write from the agent on such a job is accepted, the job returns to `writing` and an event is logged.

### Source integrity

`convex/lib/sourceScan.ts` parses lesson markdown the way the renderer does. Every http(s) link must be a source the engine saved (`saveSources`, from pages it read); unknown URLs, including raw URLs in slide and test text, are rejected with "Unknown reference: <ref>". ```youtube / ```resource blocks must reference saved resources; pasted-text resources cannot be cited as `[n]`. Engine saves are accepted only in `writing` (or `failed`, which resumes) and are refused with `BAD_STATE` "Course is published; unpublish it to let the engine write" once the course is published. Regenerating a published course is likewise refused ("Unpublish the course to regenerate"), so AI content never lands in a live course.

## eve spike results (2026-11-23)

Throwaway spike (Task 16) on branch `spike/course-builder` (never merged), agent at `agents/spike/` there, run with `eve dev --agent spike --no-ui` (eve 1.3.0, port 2000). Root model `anthropic("claude-opus-5-5")` with `reasoning: "low"`; the fan-out children use `anthropic("claude-haiku-5-5")` (works with the direct Anthropic provider). All four checks pass; approach B is not needed.

| Check | Result | Numbers |
| ----- | ------ | ------- |
| (a) Session resumes after restarting `eve dev` | Pass, **only with `eve dev --resume`** | Turn 1 stored codeword (1.2 s). Plain restart: follow-up `POST /eve/v1/session/:id` returns **500** (`DevelopmentRunUnavailableError: Local Workflow run was not resumed`). Restart with `--resume` (ready in 3 s): same session id accepted (202) and the model answered the codeword from turn 1; turn 1.1 s, cache read 1523 tokens |
| (b) Workflow tool fans out 10 `ctx.agent("echoer").send(...)` with `Promise.all` | Pass, fully parallel | 10/10 completed with correct `outputSchema` data, twice. All 10 started within 33-37 ms of each other; each child took about 0.9-1.1 s; fan-out wall clock **1152 ms / 1127 ms** (vs about 10 s if serialized). Whole turn 6.6 s / 4.9 s. No limit hit. Caveat: the children were trivial `claude-haiku-5-5` calls (about 1 s each); parallel Opus rate limits and multi-minute child runs are untested |
| (c) Tool fetches a PDF, base64, `toolOutputPart.file(..., { mediaType: "application/pdf" })` | Pass | Locally generated 710-byte PDF with a unique first line: the model quoted it verbatim; turn 3.4 s, tool call 13 ms. Public W3C `dummy.pdf` (13 KB): quoted "Dummy PDF file"; turn 3.2 s. The PDF adds about 1.8 K input tokens per model call |
| (d) `jwtHmac` channel | Pass | Valid HS256 token (`sub: "course-builder-route"`, 60 s expiry): **202**. Wrong secret, `alg: none`, expired, wrong `sub`, no header: **401** `{"code":"unauthorized"}`. Follow-up and stream with a wrong-secret token: 401. Unknown session: **409** `session_not_active`. `GET /eve/v1/info` with a valid token: 200 (`jwtHmac` callers are `service` principals) |

### API notes for Task 17

- **Agent:** `import { defineAgent } from "eve"; import { anthropic } from "eve/models/anthropic";` `defineAgent({ model: anthropic("claude-opus-5-5"), reasoning: "low" | "medium" | ..., defaultTools: false })`. Subagents: `agent/subagents/<name>/agent.ts` (+ `instructions.md`, own `tools/`), `defineAgent({ description /* required */, model, reasoning, defaultTools: false, tool: false /* hidden from the parent model, still reachable via ctx.agent */ })`. A subagent inherits nothing from the root.
- **Tool:** `import { defineTool, toolOutput, toolOutputPart } from "eve/tools";` `defineTool({ description, inputSchema: z.object({...}), async execute(input, ctx) {...}, toModelOutput(output) {...} })`. `ctx.abortSignal` aborts when the turn is cancelled; pass it to `fetch`.
- **PDF to the model:** return the base64 from `execute`, then `toModelOutput: (o) => toolOutput.content([toolOutputPart.text("..."), toolOutputPart.file(o.base64, { mediaType: "application/pdf", filename: "source.pdf" })])`. eve warns above 3 MiB, saves the file to the session sandbox and re-sends it on every later model call (cost). For big files use `toolOutputPart.fileUrl(httpsUrl, { mediaType })` (https only; the URL must stay readable for the whole session). Note the full `execute` output (including base64) is stored on `call.settled`; keep it small or drop the base64 there.
- **Workflow tool:** `defineWorkflowTool({ description, inputSchema, async execute(input, ctx) { "use workflow"; ... } })` from `eve/tools`. Side effects, clocks and app calls go in top-level `async function x() { "use step"; ... }`. Fan-out: `await Promise.all(items.map(async (it) => { const r = await ctx.agent("chapter-writer").send(msg, { outputSchema: zodSchema, signal: ctx.abortSignal }); return await r.result(); }))`; `result()` gives `{ status: "completed" | "failed" | "cancelled", data, reply, error? }`. `ctx.agent(name, { model })` overrides need an AI Gateway model id, so keep the model in the subagent's own `agent.ts`. Durable primitives come from `eve/workflow` (`sleep`, `FatalError`, `RetryableError`). A session runs at most 32 working tasks.
- **Built-in web tools:** with `defaultTools: false`, add `agent/tools/web_fetch.ts` with `export { default } from "eve/tools/web_fetch";` and `agent/tools/web_search.ts` with `import { webSearch } from "eve/tools/web_search"; export default webSearch({ provider: "native" });` (`provider` is required by the type but applies only to AI Gateway models; a direct Anthropic model always gets Anthropic's native search). Not exercised in the spike.
- **Channel:** `agent/channels/eve.ts`: `eveChannel({ auth: [jwtHmac({ algorithm: "HS256", issuer: "llm-platform", audiences: ["course-builder"], subjects: ["course-builder-route"], secret: process.env.COURSE_BUILDER_CHANNEL_SECRET! })] })` from `eve/channels/eve` and `eve/channels/auth`. `issuer` and `audiences` are required; the token must carry matching `iss`, `aud`, `sub`, `exp` (clock skew 30 s). No `localDev()`, so local calls need a token too.
- **HTTP (what `sendToAgent` does):** header `Authorization: Bearer <HS256 JWT>`, `Content-Type: application/json`.
  - New session + first turn: `POST <base>/eve/v1/session` with `{"message": "<text>"}` (optional `operationId` for retry-safe create) → **202** `{"ok":true,"sessionId":"wrun_...","deliveryId":"..."}`.
  - Follow-up: `POST <base>/eve/v1/session/<sessionId>` with `{"message": "<text>", "idempotencyKey"?: "..."}` → **202** with a new `deliveryId`. Unknown or ended session → **409** `session_not_active` (create a new session and store the new id). Unknown fields → 400.
  - Watch: `GET <base>/eve/v1/session/<sessionId>/stream` (NDJSON `{at, facts:[...]}`; `?follow=false` reads recorded history). Turn end is `turn.settled` (`outcome`), reply text is `content.completed` with `kind: "text"`.
  - Base URL: `http://127.0.0.1:2000` for `eve dev`; behind `withEve` in a workspace the agent mounts at `/eve/<name>/v1/*` (for example `/eve/course-builder/v1/session`). The typed alternative is `new Client({ baseUrl, auth: { bearer: () => sign() } })` from `eve/client`, then `client.sessions.create({ message })` / `client.sessions.attach(id).send(text)`.
- **Token usage:** yes, per model run. The stream has `usage.recorded` facts `{ kind: "model", owner: { runId } | { callId }, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }`; a workflow tool's children are rolled up into one record owned by the tool's `callId` (10 children: 5330 in / 490 out). No `costUsd` with the direct Anthropic provider. `limits.sessionUsage` can cap spend.

### Gotchas

- **`--resume` is required locally.** A new `eve dev` leaves old sessions dormant; the dev script for the course-builder should run `eve dev --agent course-builder --resume` so job sessions survive a restart. On Vercel Workflow sessions survive redeploys without this.
- **`eve dev` auto-installs `just-bash`.** On first start it ran `npm install --save-dev just-bash` (default sandbox; tool file parts are written to the sandbox), editing `package.json` and `package-lock.json`. Task 17 should add it on purpose and commit it.
- **Env and port:** `eve dev --agent <name>` from the repo root loads the root `.env.local` (both `ANTHROPIC_API_KEY` and `COURSE_BUILDER_CHANNEL_SECRET` were picked up). Default port 2000 (`--port` or `PORT` to change); with `--no-ui` wait for the `[DEV] ready at` line.
- **Bundling app code:** a workflow tool imported `commandMessage` / `parseCommand` from `../../../../src/lib/course-builder/commands` and called them in a step; it bundled and ran (`importProbe: true`). Importing `../../convex` was not tried.
- **Local world warning:** the local Workflow world logs that `POST /.well-known/workflow/v1/flow` is unauthenticated; fine for local dev, never expose `eve dev` beyond loopback.
- **Child models:** the parent stream shows only parent `model.started`; child events (including `anthropic/claude-haiku-5.5`) are on the child's own stream (`child.opened.sessionId`).
