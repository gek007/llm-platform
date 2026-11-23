# Hands-on labs (POC on E2B) — design and build contract

Date: 2026-11-23. State: **planned, not started.** Scope: a proof of concept on the dev setup (Clerk dev instance, an agent Convex deployment, E2B Hobby tier). Production rollout, billing for labs and an admin UI are out of scope.

## Intent

A technical course can have a **lab**: a temporary Linux machine with the course's tools already installed, opened in the browser next to a list of exercises. The student signs in, starts the lab, works in a terminal and/or VS Code, and clicks **Check** on each exercise. A script inside the machine decides whether the exercise passed, and the result shows up in the app right away.

The POC has to prove that the whole loop works (start → work → check → progress → stop) and produce numbers for the next decision: how long a start takes, how long a check takes, what a lab-hour costs, and whether the terminal feels responsive from Europe.

## Decisions

### Owner's

- Labs run in **E2B** sandboxes (Firecracker microVMs, hosted by E2B). Each lab is built from a **Dockerfile** with its dependencies and tools already installed.
- Students can get **both a terminal and VS Code** in the browser.
- The POC runs on the **free Hobby tier**. Paying is decided after the POC, using its cost numbers.

### Builder's (change freely if the owner objects)

- **One lab image** for the pilot, containing both **ttyd** (browser terminal, port 7681) and **code-server** (VS Code, port 8080), running as a non-root `student` user. Each lab sets `interface: "terminal" | "vscode" | "both"` to choose which tabs the page shows.
- **Provider interface.** Convex talks to labs only through a small `LabProvider` interface with three implementations: `E2BLabProvider` (real), `DockerLabProvider` (local development on the owner's Mac, since E2B can't run locally) and `FakeLabProvider` (unit and E2E tests). Moving to Fly.io Machines later means writing a fourth one.
- **Checks run from outside the student's shell.** Convex calls `sandbox.commands.run("/lab/exercises/<id>/check.sh")` as root. Check scripts are root-owned and not writable by `student`. Exit code `0` = pass; stdout (truncated to 4 KB) is the feedback shown to the student.
- **Access rule** follows the course: a lab of a free course needs a signed-in user, a lab of a Pro course needs Pro, admins can start any lab. There are no anonymous labs, not even for free-preview lessons, because every start costs money. The rule is a pure function `canStartLab` in `convex/lib/access.ts`, built on the same inputs as `canAccessLesson`.
- **Limits:** one active session per user, a hard **45-minute** lifetime (E2B `timeoutMs`, plus a Convex cron as a second safety net), 1 vCPU / 1 GB for `terminal` labs, 2 vCPU / 2 GB when VS Code runs.
- **No persistence.** Every start is a fresh machine. Pause/resume comes later.
- **Labs are defined in seed data** (`convex/lib/seedData.ts`), not through an admin UI.
- The `E2B_API_KEY` is set only on the Convex deployment, like the Mux keys. It never goes into `.env.local`'s `NEXT_PUBLIC_*` keys, files or Vercel.

### POC security trade-off (must change before real students)

E2B gives each sandbox port a public URL. In the POC the URLs are protected only by being unguessable, by a **per-session password** for ttyd (`-c student:<password>`) and code-server (`PASSWORD` env var), and by the 45-minute lifetime. Convex generates the password, passes it to the sandbox at start, and shows it only to the session's owner. That's fine for the owner and a few trusted testers. Before a public launch: a signed lab token checked by an auth proxy inside the sandbox, egress limits and per-user minute quotas (see Follow-ups).

## Architecture

```
Browser ── lab page (Clerk) ──> Convex labs.start (access, 1 active session)
                                     │ scheduled action → LabProvider.start(template, env)
                                     ▼
                               E2B sandbox: ttyd :7681, code-server :8080, /lab/**
Browser ── iframe (terminal / VS Code), per-session password ──> sandbox URLs
Browser ── "Check" ──> Convex labs.check action → provider.runCheck → labAttempts → live UI update
Convex cron (every minute) → stop expired sessions, reconcile with E2B
```

## Lab image (`labs/`)

```
labs/
  images/<lab-slug>/
    e2b.Dockerfile          Base image + tools + ttyd + code-server + /lab content
    e2b.toml                E2B template config (written by `e2b template build`)
    start.sh                Start command: runs setup.sh, then ttyd and code-server as `student`
    lab/
      setup.sh              Prepares the starting files in /home/student/lab
      exercises/<id>/
        check.sh            Root-owned, exit 0 = pass, stdout = feedback
        solution.sh         Reference solution, used only by the image test, never copied into the image
  scripts/test-image.sh     docker build + run: every check fails on the start state and passes after solution.sh
```

Exercise instructions live in Convex (markdown rendered with `LessonMarkdown`), not in the image, so text fixes don't need a template rebuild.

Template build: `npx @e2b/cli template build` from the image folder (a one-off owner step, see Owner setup). The template name is stored in the `labs` row.

## Data model (additions to `convex/schema.ts`)

| Table | Fields | Indexes |
| ----- | ------ | ------- |
| `labs` | `courseId`, `lessonId?`, `slug`, `title`, `summary`, `template` (E2B template name), `interface` (`terminal\|vscode\|both`), `cpu`, `memoryMb`, `maxMinutes`, `status` (`draft\|published`) | `by_course`, `by_slug` |
| `labExercises` | `labId`, `order`, `title`, `instructions` (markdown), `checkId` (folder name under `/lab/exercises`) | `by_lab_order` |
| `labSessions` | `userId`, `labId`, `provider` (`e2b\|docker\|fake`), `sandboxId?`, `status` (`starting\|running\|stopping\|stopped\|failed`), `terminalUrl?`, `ideUrl?`, `password?`, `startedAt`, `expiresAt`, `endedAt?`, `error?` | `by_user_status`, `by_status_expires`, `by_lab` |
| `labAttempts` | `sessionId`, `labId`, `exerciseId`, `userId`, `passed`, `output`, `durationMs`, `checkedAt` | `by_session_exercise`, `by_user_lab` |

`password` and the URLs are returned only to the session's owner (and admins).

## Convex API

| Function | Kind | Does |
| -------- | ---- | ---- |
| `labs.getForViewer({ courseSlug, labSlug })` | query | Lab, exercises, `canStart`, the viewer's active session (with URLs and password) and best result per exercise |
| `labs.listForCourse({ courseId })` | query | Published labs of a course (for the course page) |
| `labs.start({ labId })` | mutation | Checks `canStartLab`, refuses if the user has an active session (`ConvexError("LAB_ALREADY_RUNNING")`), inserts a `starting` session, schedules `labsNode.startSandbox` |
| `labsNode.startSandbox({ sessionId })` | internal action ("use node") | `provider.start(...)` → saves `sandboxId`, URLs, `running`; on error `failed` with a message |
| `labs.check({ sessionId, exerciseId })` | action | Re-checks ownership and that the session is `running`, runs the check through the provider (30 s timeout), writes a `labAttempts` row |
| `labs.stop({ sessionId })` | mutation | Owner or admin; marks `stopping` and schedules `labsNode.stopSandbox` |
| `labsNode.reap` | internal action, cron every minute | Stops sessions past `expiresAt`, marks sessions `stopped` when E2B says the sandbox is gone |

`convex/lib/labProvider.ts` defines:

```ts
interface LabProvider {
  start(input: { template: string; cpu: number; memoryMb: number; timeoutMs: number; env: Record<string, string> }):
    Promise<{ sandboxId: string; terminalUrl?: string; ideUrl?: string }>;
  runCheck(sandboxId: string, checkId: string): Promise<{ passed: boolean; output: string; durationMs: number }>;
  stop(sandboxId: string): Promise<void>;
  isAlive(sandboxId: string): Promise<boolean>;
}
```

The Convex env var `LAB_PROVIDER` (`e2b` | `docker` | `fake`, default `fake`) chooses the implementation. `DockerLabProvider` talks to a small dev-only helper on the owner's machine (`scripts/lab-docker-helper.ts`, exposed to Convex through a tunnel), because Convex actions run in the cloud and can't reach the local Docker daemon. If that turns out to be awkward, local testing falls back to `docker run` plus `scripts/test-image.sh`, and the app is tested against E2B directly.

## UI

- **`/courses/[slug]/labs/[lab]`**, a client page:
  - Left: lab summary, exercise checklist (instructions, **Check** button, last result and output per exercise).
  - Right: tabs **Terminal** / **Editor** (per `interface`) with the sandbox iframes, and the session password with a copy button.
  - Top bar: state (Start / Starting… / time left / Stopped), **Stop**, and **Restart** (stop + start).
  - Locked state: sign-in prompt or "Pro required", the same components the lesson page uses.
- **Course page:** a "Labs" section listing the course's labs.
- **Dashboard:** number of passed exercises per lab.
- UI SDK wrappers from `src/components/ui/` for the tabs, buttons and status.

## Tests

- **Unit (`convex-test`):** `canStartLab` matrix; one-active-session rule; start → running → stop with `FakeLabProvider`; `check` refuses other users' sessions and stopped sessions; reaper stops expired sessions; password and URLs are hidden from other users.
- **Component (Vitest + Testing Library):** lab page in each state (locked, idle, starting, running, check passed/failed, stopped, failed).
- **E2E (Playwright):** signed-out user sees the lab but gets a sign-in prompt instead of Start. The signed-in flow runs against `LAB_PROVIDER=fake` once Clerk testing tokens exist (same open item as the other signed-in flows).
- **Image test:** `labs/scripts/test-image.sh <lab>` builds the image with Docker, runs every check on the starting state (must fail), applies the reference solutions, runs the checks again (must pass).

## Implementation order

Each step ends with `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` and an update to `docs/ARCHITECTURE.md` and `docs/features/labs.md`. `convex/` changes are made in an agent worktree with its own deployment (`scripts/agent-deployment.sh`), never on `hallowed-iguana-534`.

1. **Image.** Write the pilot lab's Dockerfile, `start.sh`, setup and 3–4 exercises with checks and reference solutions. Pass `test-image.sh` locally with Docker.
2. **E2B template.** Build the template (owner step: E2B account and CLI login). Start a sandbox by hand with the CLI, open both URLs, and measure **start time** and **memory use** with and without code-server.
3. **Backend.** Schema, `canStartLab`, `LabProvider` with the fake and E2B implementations, `labs.*` functions, reaper cron, seed data, unit tests.
4. **UI.** Lab page, course page section, dashboard counter, component and E2E tests.
5. **Real run.** The owner (and one or two testers) completes the lab end to end against E2B. Record the numbers below in `docs/features/labs.md`.

## Success criteria (measured in step 5)

| Metric | Target |
| ------ | ------ |
| Click Start → terminal usable | < 10 s |
| Click Check → result shown | < 3 s |
| Typing latency in the terminal from Europe | feels responsive (note E2B's region) |
| Sandboxes still running after their session ended | 0 (checked in the E2B dashboard) |
| Cost per lab-hour (terminal / VS Code) | recorded, used for the E2B Pro vs Fly.io decision |
| Free-tier credits used by the POC | recorded |

## Owner setup

1. Create an E2B account (Hobby, free) and an API key.
2. Install and log in to the CLI: `npm i -g @e2b/cli && e2b auth login` (needed to build templates).
3. Set the key on the agent's Convex deployment only, without printing it: `npx convex env set E2B_API_KEY` (then `LAB_PROVIDER=e2b`). Production later gets its own key.
4. Choose the pilot course and topic (see Open questions).

## Open questions

- **Pilot topic and course.** Default if nobody decides: a free "Linux & Git basics" lab (navigate files, write a script, make a commit, fix a merge conflict), because its checks are easy to write and it needs only the terminal. A programming lab (e.g. Python: make the tests pass) would also exercise VS Code.
- **E2B region.** Confirm where the hosted sandboxes run. If it's US-only and typing lag is noticeable from Europe, that counts against E2B in the post-POC decision.
- **Exact Hobby-tier limits** (credits, maximum session length, concurrency). The 45-minute lifetime assumes a cap of at least 1 hour.

## Follow-ups after the POC (not in scope)

- Access hardening: signed lab token (RS256 from Convex, like `convex/playback.ts`) checked by an auth proxy in front of ttyd and code-server; drop the password.
- Egress limits per lab; per-user monthly lab minutes (Free vs Pro).
- Admin pages under `/admin/labs`: labs, exercises, template names, active sessions with force-stop, usage and cost.
- Pause/resume to keep a student's work between sessions.
- AI tutor hints that read check output.
- Decide between E2B Pro and Fly.io Machines (`ams`/`lhr`) based on the POC numbers.
