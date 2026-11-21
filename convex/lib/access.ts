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
