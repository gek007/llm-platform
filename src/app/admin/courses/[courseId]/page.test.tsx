import { isValidElement, Suspense } from "react";
import { expect, test, vi } from "vitest";
import CoursePage from "./page";

vi.mock("@/components/admin/course-editor", () => ({ CourseEditor: () => null }));

// With cacheComponents + partialPrefetching, Next validates in dev that the App Shell holds no URL data:
// awaiting `params` outside <Suspense> shows an error on every course edit page.
test("renders its shell without waiting for params", () => {
  const never = new Promise<never>(() => {});
  const shell = CoursePage({ params: never, searchParams: never } as never);
  expect(shell).not.toBeInstanceOf(Promise);
  expect(isValidElement(shell) && shell.type).toBe(Suspense);
});
