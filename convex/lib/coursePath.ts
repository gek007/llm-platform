/**
 * Slides first: a chapter opens with its slide deck, and its lessons are the reading that follows.
 * Shared by the server (dashboard cards) and the browser (course page), so "Start" and "Continue"
 * lead to the same place everywhere.
 */

export type PathChapter = { slug: string; lessonIds: readonly string[]; hasDeck: boolean };

/** The chapter a lesson belongs to, if the course has chapters. */
export function chapterOfLesson<C extends PathChapter>(lessonId: string, chapters: readonly C[]): C | undefined {
  return chapters.find((chapter) => chapter.lessonIds.includes(lessonId));
}

/**
 * Where a learner whose next lesson is `nextLessonId` should land: the slug of that lesson's chapter
 * when they have not started it yet (none of its lessons done) and it has slides, so the chapter
 * opens with its deck. Null means "go to the lesson": mid-chapter, a chapter without slides, or a
 * course without chapters.
 */
export function chapterToStart(
  nextLessonId: string | undefined,
  chapters: readonly PathChapter[],
  done: ReadonlySet<string>,
): string | null {
  if (!nextLessonId) return null;
  const chapter = chapterOfLesson(nextLessonId, chapters);
  if (!chapter?.hasDeck) return null;
  return chapter.lessonIds.some((id) => done.has(id)) ? null : chapter.slug;
}
