import { ConvexError } from "convex/values";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebabCase(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const messages: Record<string, string> = {
  UNAUTHENTICATED: "You are signed out. Sign in again.",
  FORBIDDEN: "Only the admin can do this.",
  NOT_FOUND: "That item no longer exists.",
  INVALID_SLUG: "The slug must be kebab-case (lowercase letters, numbers and single hyphens).",
  SLUG_TAKEN: "That slug is already in use.",
  INVALID_TITLE: "The title is required.",
  INVALID_DURATION: "Duration must be zero or more minutes.",
  INVALID_REORDER: "The lesson list changed; reload and try again.",
  MUX_NOT_CONFIGURED: "Mux credentials are not configured on the Convex deployment.",
  BAD_STATE: "The job is no longer in a state that allows this. The page shows its current status.",
  INVALID_TOPIC: "Enter a topic (3 to 200 characters).",
  INVALID_OUTLINE: "The outline is invalid: every chapter needs a title, a goal and at least one subchapter (max 10 chapters, 5 subchapters each).",
  INVALID_RESOURCE: "That resource is not valid.",
  PDF_TOO_LARGE: "The PDF is larger than 20 MB.",
  MUX_UPLOAD_FAILED: "Mux did not return an upload URL.",
};

/** Turns a thrown Convex error into text safe to show the admin. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return messages[error.data] ?? error.data;
  }
  const raw = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : "Something went wrong. Try again.";
}

export const quizTemplate = `\`\`\`quiz
{
  "question": "Your question?",
  "options": ["Option A", "Option B", "Option C"],
  "answer": 0,
  "explanation": "Why this answer is correct."
}
\`\`\`
`;

/** Appends a quiz block to markdown, separated by a blank line. */
export function insertQuizBlock(body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${quizTemplate}` : quizTemplate;
}
