# Course

## Routes

| Route | File | Notes |
| ----- | ---- | ----- |
| `/courses` | `src/app/courses/page.tsx` | Server shell, renders client `CourseCatalog` (`courses.listPublished`). Has `error.tsx` and `not-found.tsx` (no `loading.tsx`: the route is static and the `[slug]` pages have their own `<Suspense>` skeletons) (shared by the subtree). |
| `/courses/[slug]` | `src/app/courses/[slug]/page.tsx` | `params` awaited inside `<Suspense>`; client `CourseDetail`; `notFound()` when `getBySlug` is `null`. |
| `/courses/[slug]/lessons/[lessonSlug]` | `.../page.tsx` | Same pattern; client `LessonView`. |
| `/dashboard` | `src/app/dashboard/page.tsx` | `await auth.protect()` inside Suspense (plus the proxy gate), then client `DashboardCourses` (`enrollments.listMine`). |

## Components

- `src/components/course/`: `course-card`, `course-catalog`, `course-detail`, `dashboard-courses`, `enroll-button`, `lesson-outline`, `progress-bar`, `badges`, `icons`, `format.ts` (duration/href helpers).
- `src/components/lesson/`: `lesson-view` (fetches), `lesson-player` (presentational, carries `data-course-slug` / `data-lesson-slug`), `complete-toggle` (optimistic `progress.setComplete`), `locked-lesson`, `lesson-nav`, `lesson-sidebar` (collapsible below `lg`).
- `src/components/video/lesson-video.tsx`: `@mux/mux-player-react/lazy` with title/series metadata.

## Data flow

All data is fetched client-side with `useQuery`, so it is reactive and auth-aware (the Convex token only exists in the browser). Pages SSR the skeleton, then hydrate. Gating is entirely server-side in Convex: the player only renders the body or video when `getForViewer` returns them (`locked` lessons have neither), and `LockedLesson` never receives a body.

Locked card: signed out gets "Sign in to continue" (+ "See Pro plan" for pro courses); signed in without Pro gets "Upgrade to Pro" linking to `/pricing`. Sign-in links use `/sign-in?redirect_url=<path>`.

Enroll button states: loading, signed out, enrolled (Continue), pro without Pro (Upgrade to Pro), enroll (handles `ConvexError` `PRO_REQUIRED` by switching to the upgrade link).

## For the coordinator

- Run `npm run test:e2e` for `e2e/courses.spec.ts` (signed-out flows; relies on the seeded courses). The locked-lesson e2e expects the signed-out card ("Sign in to continue", "See Pro plan"), not "Upgrade to Pro".
- No Convex changes needed. `enrollments.listMine` does not return `durationMinutes`, so dashboard cards omit duration.
- No new packages.
- Unrelated typecheck/lint failures seen in other agents' files at the time of writing: `src/components/admin/use-admin-query.ts`, `src/components/tutor/*`.
