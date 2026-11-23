export type AccessCourse = { tier: "free" | "pro" };
export type AccessLesson = { isFreePreview: boolean };

/**
 * Pure access rule for a lesson's body and video.
 * Admin: everything. Free preview: anyone. Free course: any signed-in user.
 * Pro course: Pro members only.
 */
export function canAccessLesson(args: {
  course: AccessCourse;
  lesson: AccessLesson;
  signedIn: boolean;
  pro: boolean;
  admin: boolean;
}): boolean {
  const { course, lesson, signedIn, pro, admin } = args;
  if (admin) return true;
  if (lesson.isFreePreview) return true;
  if (course.tier === "free") return signedIn;
  return signedIn && pro;
}

/**
 * Pure access rule for a course's chaptered content (slide decks, chapter tests, chapter pages).
 * Admin: everything. Free course: any signed-in user. Pro course: Pro members only.
 */
export function canAccessCourseContent(args: {
  course: AccessCourse;
  signedIn: boolean;
  pro: boolean;
  admin: boolean;
}): boolean {
  const { course, signedIn, pro, admin } = args;
  if (admin) return true;
  if (course.tier === "free") return signedIn;
  return signedIn && pro;
}

export type PlaybackLesson = AccessLesson & {
  muxPlaybackId?: string;
  videoStatus?: "waiting" | "processing" | "ready" | "errored";
};

/**
 * The Mux playback ID a viewer may be given a token for, or null when the lesson is locked
 * or has no ready video. Same access rule as the lesson body (`canAccessLesson`).
 */
export function playbackIdForViewer(args: {
  course: AccessCourse;
  lesson: PlaybackLesson;
  signedIn: boolean;
  pro: boolean;
  admin: boolean;
}): string | null {
  const { lesson } = args;
  if (!lesson.muxPlaybackId || lesson.videoStatus !== "ready") return null;
  return canAccessLesson(args) ? lesson.muxPlaybackId : null;
}
