# LMS features — design and build contract

Date: 2026-11-21. Scope: dev setup (Clerk dev instance, Convex dev deployment `hallowed-iguana-534`, Mux development environment). Production instance, custom domain and Stripe are out of scope.

## Intent

A single-tutor course platform. The owner is the only tutor and the only admin. Students browse courses, enroll, watch Mux videos, read rich markdown lessons with code blocks and quizzes, and mark lessons complete. Some courses are free, some need the Pro tier (Clerk Billing). Pro courses can mark single lessons as free previews so people can try before upgrading. Pro members get an AI tutor widget that knows where they are and what they've done.

## Decisions (owner's)

- Pro tier is sold through **Clerk Billing**, with a **custom pricing page** that uses Clerk's checkout button (`CheckoutButton`, not `<PricingTable />`).
- One plan, **monthly and yearly**; yearly = 10 × monthly (two months free).
- Admin = a **Clerk role** set to `admin` on the user.
- Lesson videos via **Mux**.
- AI agent: bottom-right widget, Pro only, context aware (page, lesson), suggestions, interactive quizzes, sees the catalog and the user's progress, **authenticated via Clerk**.
- The landing page must look outstanding and have an animation showing what's inside the platform; scrolling reveals the courses, what each course offers, and the tutor.

## Decisions (builder's calls; change freely if the owner objects)

- **Admin role** lives in Clerk `publicMetadata.role = "admin"` (single-tenant app, so no Organizations). Exposed to the session token via a custom claim `metadata: {{user.public_metadata}}`, so both Next.js (`sessionClaims.metadata.role`) and Convex (`identity.metadata`) can read it without an API call.
- **Pro check:** Clerk Billing plan slug `pro`, free plan `free_user` (Clerk default). Next.js checks `has({ plan: "pro" })`. Convex checks the plan from the session token's plan claim if present (verify the claim name in the Clerk docs/the clerk-billing skill: session token v2 carries plans in `pla`, e.g. `u:pro`). If Convex can't read plans from the token, fall back to a Clerk Billing webhook → Convex HTTP action that stores `plan` on the `users` row. The single source of truth for Convex is `convex/lib/auth.ts#isPro(ctx)`.
- **Gating is server-side.** Convex never returns a lesson's `body` or `muxPlaybackId` to someone who can't access it. Rule (pure function `canAccessLesson` in `convex/lib/access.ts`, unit-tested): `course.tier === "free"` → any signed-in user (signed-out users only see free previews); `lesson.isFreePreview` → anyone; `course.tier === "pro"` → Pro or admin. Admins can access everything, drafts included.
- **Enrollment** is explicit (an "Enroll" button), free for free courses; a Pro course requires Pro to enroll. Marking complete requires access to the lesson (and auto-enrolls).
- **Quizzes in markdown:** a fenced code block with language `quiz`, JSON body:
  ````md
  ```quiz
  { "question": "What does `as const` do?", "options": ["A", "B", "C"], "answer": 1, "explanation": "…" }
  ```
  ````
  `answer` is the 0-based correct option. Multiple quiz blocks per lesson are allowed. Invalid JSON renders an inline error box (never crashes the page).
- **Mux playback:** public playback IDs for now; the ID is only sent to authorized users. Signed playback is a follow-up.
- **Tutor bio** lives in `src/config/site.ts` (`siteConfig.tutor`) with placeholder text the owner fills in.
- `/learnly` stays as is; the widget is the main entry point.

## Data model (`convex/schema.ts`)

| Table | Fields | Indexes |
| ----- | ------ | ------- |
| `users` | `clerkId`, `name`, `email?`, `imageUrl?`, `plan?` (`"free" \| "pro"`, only if webhook fallback is used) | `by_clerkId` |
| `courses` | `slug`, `title`, `summary`, `description` (markdown), `level` (`beginner\|intermediate\|advanced`), `tier` (`free\|pro`), `status` (`draft\|published\|archived`), `tags: string[]`, `outcomes: string[]` ("what you'll learn"), `coverImageUrl?`, `order` (catalog order) | `by_slug`, `by_status_order` |
| `lessons` | `courseId`, `slug`, `title`, `summary`, `body` (markdown), `order`, `durationMinutes`, `isFreePreview`, `muxUploadId?`, `muxAssetId?`, `muxPlaybackId?`, `videoStatus?` (`waiting\|processing\|ready\|errored`) | `by_course_order`, `by_course_slug` |
| `enrollments` | `userId` (Clerk subject), `courseId`, `enrolledAt` | `by_user`, `by_user_course`, `by_course` |
| `lessonProgress` | `userId`, `courseId`, `lessonId`, `completedAt` | `by_user_course`, `by_user_lesson` |

User identity in Convex = `identity.subject` (Clerk user ID). `users` rows are upserted by a `users.store` mutation called on sign-in (from the client provider).

## Convex API (built by the foundation agent; feature agents consume it and add only new files)

`convex/lib/auth.ts`: `getIdentity(ctx)`, `requireUser(ctx)`, `isAdmin(ctx)`, `requireAdmin(ctx)`, `isPro(ctx)`.
`convex/lib/access.ts`: `canAccessLesson({ course, lesson, signedIn, pro, admin })` → boolean.

| Function | Kind | Returns / does |
| -------- | ---- | -------------- |
| `courses.listPublished` | query | Published courses by `order`, each with `lessonCount`, `durationMinutes`, `previewCount` |
| `courses.getBySlug({ slug })` | query | Published course (any status for admin) + lesson outline (`_id, slug, title, summary, order, durationMinutes, isFreePreview, hasVideo, locked`), no bodies; `null` if missing |
| `lessons.getForViewer({ courseSlug, lessonSlug })` | query | `{ course, lesson, locked, prev, next }`; `lesson.body`/`muxPlaybackId` only when unlocked |
| `enrollments.enroll({ courseId })` | mutation | Idempotent; throws `ConvexError("PRO_REQUIRED")` when needed |
| `enrollments.isEnrolled({ courseId })` | query | boolean |
| `enrollments.listMine` | query | My enrolled courses with `completedCount`, `lessonCount`, `nextLessonSlug` |
| `progress.setComplete({ lessonId, complete })` | mutation | Mark/unmark complete; checks access |
| `progress.forCourse({ courseId })` | query | Completed lesson IDs for me |
| `users.store` | mutation | Upsert current user |
| `viewer.get` | query | `{ signedIn, isAdmin, isPro, user }` |
| `seed.run` | internal mutation | Inserts the sample courses + lessons (idempotent, by slug); run with `npx convex run seed:run` |

Admin (admin agent owns `convex/admin.ts`, `convex/mux.ts`, `convex/http.ts`): every function calls `requireAdmin`. CRUD for courses and lessons, lesson reorder, Mux direct upload creation, asset status sync.

## Routes

| Route | Owner | Notes |
| ----- | ----- | ----- |
| `/` | landing agent | Animated hero, catalog section, "what each course offers", tutor section, pricing teaser, CTA |
| `/pricing` | landing agent | Custom: monthly/yearly toggle, Free vs Pro cards, Clerk `CheckoutButton` for the `pro` plan with the chosen period; signed-out users get sign-in first; current Pro users see "You're on Pro" + manage link |
| `/courses` | course agent | Catalog grid |
| `/courses/[slug]` | course agent | Course page: description, outcomes, lesson outline with lock/preview badges, enroll button, progress |
| `/courses/[slug]/lessons/[lessonSlug]` | course agent | Player: Mux video (if any), markdown body, mark complete, prev/next, sidebar outline with checkmarks, upgrade prompt when locked |
| `/dashboard` | course agent | My courses with progress, continue buttons |
| `/admin/**` | admin agent | Admin only (server check in the layout + Convex `requireAdmin`); courses list, course editor (all fields), lessons editor (markdown with live preview, free-preview toggle, order, Mux upload with status) |
| `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]` | foundation | Clerk components |

## Shared components (foundation agent)

- `src/components/providers/convex-client-provider.tsx`: `"use client"` `ConvexProviderWithClerk`, calls `users.store` once signed in.
- `src/components/layout/site-header.tsx`, `site-footer.tsx`: logo, nav (Courses, Pricing, Dashboard when signed in, Admin when admin), sign-in button / `UserButton`.
- `src/components/markdown/lesson-markdown.tsx`: `LessonMarkdown({ source })`, GFM, syntax-highlighted code blocks with a copy button, `quiz` blocks rendered by `src/components/markdown/quiz-block.tsx` (`QuizBlock({ quiz })`, also used by the tutor widget). Exported `parseQuiz(json)` with tests.
- Design tokens in `globals.css`: a cohesive dark-first palette, font pairing, radius, shadows. Feature agents use these tokens rather than inventing new ones.

## File ownership in the parallel phase

Agents work in the same tree at the same time. Each one touches **only** its own paths; anything else is reported back, not edited.

| Agent | Owns |
| ----- | ---- |
| landing | `src/app/page.tsx`, `src/app/page.test.tsx`, `src/app/pricing/**`, `src/components/landing/**`, `src/components/pricing/**`, `e2e/landing.spec.ts`, `e2e/pricing.spec.ts`, `docs/notes/landing.md` |
| course | `src/app/courses/**`, `src/app/dashboard/**`, `src/components/course/**`, `src/components/lesson/**`, `src/components/video/**`, `e2e/courses.spec.ts`, `docs/notes/course.md` |
| admin | `src/app/admin/**`, `src/components/admin/**`, `convex/admin.ts`, `convex/mux.ts`, `convex/http.ts`, their tests, `e2e/admin.spec.ts`, `docs/notes/admin.md` |
| tutor | `agents/learnly/**`, `src/components/tutor/**`, one line in `src/app/layout.tsx` to mount `<TutorWidget />`, `src/app/api/tutor/**` if needed, `e2e/tutor.spec.ts`, `docs/notes/tutor.md` |

`package.json`/`package-lock.json`: the foundation agent installs everything up front. A feature agent that truly needs another package says so in its report instead of installing (concurrent installs corrupt the lockfile).

Parallel agents run `npm run typecheck`, `npm run lint` and `npx vitest run <their paths>` only. They must not run `npm run build`, `npm run test:e2e`, `next dev` or `npx convex dev` (shared `.next/`, port and Convex push). They may run `npx convex dev --once` **only** if they changed Convex files, and must report it. The coordinator runs the full suite at the end. `docs/ARCHITECTURE.md` is updated by the coordinator from `docs/notes/*.md`.

## Non-goals

Production deploy, custom domain, Stripe, multiple instructors, certificates, comments, signed Mux playback, i18n.
