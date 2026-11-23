# Course engine (learner side)

Spec: [course-engine-design](../superpowers/specs/2026-11-23-course-engine-design.md). This page covers what learners see; admin generation and the `course-builder` agent are added by later milestones.

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
