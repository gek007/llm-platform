export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const levelLabels = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

export function lessonHref(courseSlug: string, lessonSlug: string): string {
  return `/courses/${courseSlug}/lessons/${lessonSlug}`;
}

export function signInHref(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * The lesson page already shows the title as its <h1>. Drops a leading markdown heading that repeats it,
 * so authored bodies that start with "# <title>" don't show the title twice.
 */
export function stripLeadingTitle(body: string, title: string): string {
  const match = /^\s*#{1,2}[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(body);
  if (!match || match[1].trim().toLowerCase() !== title.trim().toLowerCase()) return body;
  return body.slice(match[0].length).replace(/^\s*\n/, "");
}
