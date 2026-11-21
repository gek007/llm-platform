# AI tutor (Learnly agent)

## Auth flow

```
Browser (Clerk signed in)
  useAuth().getToken()  -> fresh 60s session token, resolved before EVERY request (incl. stream reconnects)
  POST /eve/learnly/v1/session   Authorization: Bearer <token>   body: message + clientContext{pathname,...}
        |
Next.js (withEve proxy) -> agent channel agents/learnly/agent/channels/eve.ts
  auth: [clerkAuth()]            (lib/clerk-auth.ts)
    no Bearer            -> skip -> 401
    verifyToken fails    -> 401 (bad signature, expired, wrong azp)
    sts = pending        -> 401
    not Pro and not admin-> 403   (pla contains "u:pro", or metadata.role === "admin")
    ok -> SessionAuthContext { principalId: <Clerk user id>, attributes: { plan, convexToken, tokenExp } }
  onMessage: auth = verified caller; clientContext REPLACED by a server-built hint
        |
Tool executes (ctx.session.auth.current) -> viewerClient(): ConvexHttpClient.setAuth(token)
        |
Convex validates the same Clerk token (aud "convex") -> queries run as that user
```

- Verification: `verifyToken` from `@clerk/backend` (re-exported by `@clerk/nextjs/server`) with `CLERK_SECRET_KEY` (JWKS fetch, cached by Clerk). Set `CLERK_JWT_KEY` (the PEM public key from the Clerk dashboard) for networkless verification; it is passed automatically when present.
- `authorizedParties` (checks the `azp` claim, blocks tokens minted for other origins): `TUTOR_AUTHORIZED_PARTIES` (comma list), `NEXT_PUBLIC_APP_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`; `http://localhost:3000/3001` only when `NODE_ENV !== "production"`. If none are configured in production, `azp` is not checked (Clerk's default). Set one of them.
- The user ID is only ever the verified `sub`; no tool takes a user ID, and the client's `clientContext` is never trusted as identity.
- Removed `vercelOidc()` and `placeholderAuth()`. `localDev()` accepts any loopback browser on a dev machine, i.e. an unauthenticated one, and it carries no user token (tools would fail anyway), so it is off by default. `TUTOR_ALLOW_LOCAL_DEV=1` (ignored in production) re-enables it for TUI debugging. Consequence: `eve dev`'s terminal UI and `eve eval` cannot authenticate without a token; the smoke eval only checks AI disclosure and needs that flag locally.

## Data access choice

Option (a): forward the user's Clerk token to Convex via `ConvexHttpClient.setAuth`, so `viewer.canAccessLesson`, `locked` flags, enrollments and progress are enforced by Convex itself, with no deploy key in the agent and no new Convex code. The channel refreshes the token on every message (`auth.current` is replaced per message); tools check `tokenExp` and answer "ask the learner to send their message again" if the 60s token expired mid-turn (long tool chains). Tools: `list_courses`, `get_course_details`, `get_my_progress` (`enrollments.listMine` + `progress.forCourse` + `courses.getBySlug` for lesson slugs), `get_lesson` (`lessons.getForViewer`; no body when locked), `show_quiz`. No Convex changes needed. Mocks in `src/lib/courses/` were deleted (nothing else imported them).

## Page context

`useEveAgent({ prepareSend })` adds `clientContext: { pathname, courseSlug?, lessonSlug? }` (parsed by `src/components/tutor/page-context.ts` from `/courses/[slug]/lessons/[lessonSlug]`). On the server `onMessage` re-derives the slugs from `pathname` (client-sent slugs are ignored) and returns a labelled "unverified hint" string as `clientContext`. Instructions tell the agent to treat it as a hint; tools still enforce access. Suggestion chips change with context (lesson / course / elsewhere).

## Quizzes

`show_quiz` takes the `parseQuiz` shape (question, options, 0-based answer, explanation) and returns `{ shown, quiz }`. The chat finds the completed `show_quiz` tool part and renders `QuizBlock` (re-validated with `parseQuiz`). Assistant text goes through `LessonMarkdown`.

## Widget

`src/components/tutor/tutor-widget.tsx`, mounted once in `src/app/layout.tsx`: UI SDK `Popover` (`modal="trap-focus"`, focus return, Escape, named trigger and title), bottom-right. Hidden for signed-out users and on `/admin`, `/sign-in`, `/sign-up`; non-Pro sees a lock teaser linking to `/pricing` (no agent call); Pro/admin get `TutorChat` (`keepMounted`, so the conversation survives closing). `/learnly` reuses `TutorChat` through `LearnlyChat`.

## Remaining risks

- The Clerk token is stored in the session's `auth.current.attributes` (durable run state) for tool use. It lives 60s, but it is persisted; if that is unacceptable, switch to option (b) (Convex internal functions + deploy key keyed by the verified user id; needs Convex changes).
- Live replies use Claude Opus 5.5 through the Anthropic API and need `ANTHROPIC_API_KEY` in the agent's environment (`.env.local` locally, Vercel env in production).
- The agent process must see `CLERK_SECRET_KEY` (and `NEXT_PUBLIC_CONVEX_URL`) at runtime; verify on Vercel.
- Plan changes only reach the `pla` claim after the token refreshes (up to 60s).
- `e2e/learnly.spec.ts` (not mine) is stale: the old chat needed no sign-in; `/learnly` now shows the chat UI without a token, and sends fail with 401 until signed in. The page itself should be gated or removed.
- Playwright, build and `eve dev` were not run here.
