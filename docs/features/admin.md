# Admin

## Routes (all server-gated)

`src/app/admin/layout.tsx` calls `auth.protect()` and reads `sessionClaims.metadata.role`; anything but `"admin"` renders a 404. The proxy already redirects signed-out users to sign-in. Pages are thin server wrappers around client components in `src/components/admin/`.

| Route | Screen |
| ----- | ------ |
| `/admin` | Courses table (title, tier, status, lesson count, Edit), "New course" |
| `/admin/courses/new` | Create form |
| `/admin/courses/[courseId]` | Course form (all fields, tags/outcomes as lists), delete with confirm, lessons list (Up/Down reorder, add lesson) |
| `/admin/courses/[courseId]/lessons/[lessonId]` | Video panel (Mux uploader, status, player, replace/remove), lesson form (markdown + live preview, "Insert quiz block", free-preview switch), delete |

Data hooks wait for `useConvexAuth().isAuthenticated` before querying. `error.tsx` shows an "Admins only" message if Convex rejects with FORBIDDEN. Confirmations use UI SDK `confirm()` with an `OverlayHost` mounted by the layout. Level/tier/status use a styled native `<select>`; Switch and Textarea are UI SDK wrappers in `admin-fields.tsx`.

## Convex functions

Every function calls `requireAdmin` first (actions too). Errors are `ConvexError` strings: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, INVALID_SLUG, SLUG_TAKEN, INVALID_TITLE, INVALID_DURATION, INVALID_REORDER, MUX_NOT_CONFIGURED.

- `admin.ts`: `listCourses` (any status, `lessonCount`), `getCourse` (`{ course, lessons }` full fields), `getLesson` (`{ lesson, course }`), `createCourse`, `updateCourse`, `deleteCourse`, `createLesson` (appended as order max+1), `updateLesson`, `deleteLesson`, `reorderLessons` (exact set of ids, order 1..n).
- `mux.ts` (`"use node"`): `createUpload`, `syncLessonVideo`, `removeVideo`.
- `muxData.ts` (not requested, needed because `"use node"` files can only export actions): pure helpers (`mapMuxEvent`, `patchFromPolled`, `verifyMuxSignature`) and internal functions (`getLesson`, `setVideo`, `mergeVideo`, `applyEvent`).
- `http.ts`: `POST /mux/webhook`.

## Decisions

- Slugs: kebab-case, course slug unique globally, lesson slug unique per course. `updateCourse`/`updateLesson` take every field (full replace; omitted `coverImageUrl` clears it).
- **Deleting a course cascades** to its lessons, enrollments and lesson progress (returns counts). The UI removes lesson Mux assets first. Deleting a lesson also deletes its progress and closes the order gap.
- `lessonProgress` and the Mux ids have no indexes, so those lookups scan (fine for a single-tutor app). If it grows, add `lessonProgress.by_course` and `lessons.by_muxAssetId`/`by_muxUploadId` to the schema.
- Replacing a video deletes the previous Mux asset before creating a new upload.

## Mux flow

1. Uploader calls `createUpload({ lessonId })`: Mux direct upload (`playback_policies: ["public"]`, `cors_origin` = `MUX_CORS_ORIGIN` or `*`), lesson gets `muxUploadId` + `videoStatus: "waiting"`, the URL is returned.
2. The browser PUTs the file straight to Mux.
3. Status: the UI calls `syncLessonVideo` every 4 s while status is waiting/processing (works with no webhook). It polls upload then asset: asset ready -> `muxPlaybackId` + `ready`; errored -> `errored`; otherwise `processing`. The webhook does the same via events `video.upload.asset_created`, `video.asset.ready`, `video.asset.errored` (also `video.upload.errored/cancelled`).
4. `removeVideo` deletes the asset (404 ignored) and clears upload/asset/playback/status.

## Webhook setup (manual)

1. Mux dashboard -> Settings -> Webhooks (Development environment) -> Create new webhook.
2. URL: `<NEXT_PUBLIC_CONVEX_SITE_URL>/mux/webhook` (the `.convex.site` URL of the deployment).
3. Copy the signing secret and set it: `npx convex env set MUX_WEBHOOK_SECRET <secret>`.
4. The route fails closed. With the secret set, requests need a valid `mux-signature` (HMAC-SHA256, 5 minute timestamp tolerance) or get 401. With no secret it returns 503 and changes nothing. Only the dev flag `MUX_WEBHOOK_ALLOW_UNSIGNED=1` accepts unsigned events; never set it on a real deployment. Local dev relies on `syncLessonVideo` polling.

## Env vars (Convex deployment)

`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (set), `MUX_WEBHOOK_SECRET` (required for the webhook to accept anything), `MUX_WEBHOOK_ALLOW_UNSIGNED` (dev-only escape hatch, leave unset), `MUX_CORS_ORIGIN` (optional; set to the site origin in production, default `*`).

## Tests

`convex/admin.test.ts` (auth rejection for every function including Mux actions, CRUD, slugs, reorder, cascade, Mux mapping, signature, webhook route), component tests in `src/components/admin/*.test.tsx` (including a `createAgent` test), `e2e/admin.spec.ts` (signed-out redirect). Not covered: Mux network calls and the uploader widget.
