import { isValidElement, Suspense } from "react";
import { expect, test, vi } from "vitest";
import LessonPage from "./page";

vi.mock("@/components/admin/lesson-editor", () => ({ LessonEditor: () => null }));

// See ../../page.test.tsx: awaiting `params` outside <Suspense> fails Next's App Shell validation.
test("renders its shell without waiting for params", () => {
  const never = new Promise<never>(() => {});
  const shell = LessonPage({ params: never, searchParams: never } as never);
  expect(shell).not.toBeInstanceOf(Promise);
  expect(isValidElement(shell) && shell.type).toBe(Suspense);
});
