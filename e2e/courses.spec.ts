import { expect, test } from "@playwright/test";

// Signed-out flows against the seeded data (convex/lib/seedData.ts).

test("catalog lists seeded courses and opens a course page with its outline", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TypeScript Foundations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "React Server Components" })).toBeVisible();

  await page.getByRole("link", { name: "TypeScript Foundations" }).click();
  await expect(page).toHaveURL(/\/courses\/typescript-foundations$/);
  await expect(page.getByRole("heading", { level: 1, name: "TypeScript Foundations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What you'll learn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to enroll" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Lessons" }).getByRole("listitem")).toHaveCount(4);
});

test("free preview lesson shows the body and the quiz works", async ({ page }) => {
  await page.goto("/courses/typescript-foundations");
  await page.getByRole("link", { name: /Why types\?/ }).first().click();
  await expect(page).toHaveURL(/\/lessons\/why-types$/);
  await expect(page.locator("[data-lesson-slug='why-types'][data-course-slug='typescript-foundations']")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Why types?" })).toBeVisible();

  const quiz = page.getByRole("radiogroup", { name: "When are TypeScript types checked?" });
  await expect(quiz).toBeVisible();
  await quiz.getByRole("radio", { name: /Before the code runs/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  // Scoped to the quiz: the lesson's video player has its own status ("Loading video…").
  const quizRegion = page.getByRole("region", { name: "When are TypeScript types checked?" });
  await expect(quizRegion.getByRole("status")).toContainText("Correct!");
});

test("a locked pro lesson shows the gate card and no lesson content", async ({ page }) => {
  await page.goto("/courses/react-server-components/lessons/the-client-boundary");
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See Pro plan" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByText("Quick check")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark as complete" })).toHaveCount(0);
});

test("an unknown course shows the not-found page", async ({ page }) => {
  await page.goto("/courses/does-not-exist");
  await expect(page.getByRole("heading", { name: "Course not found" })).toBeVisible();
});

test("dashboard redirects signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/);
});

test("course and lesson pages render on the server without React errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // Error #419 means a Suspense boundary fell back to client rendering (e.g. a ClerkProvider resume mismatch).
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/courses/typescript-foundations");
  await expect(page.getByRole("heading", { level: 1, name: "TypeScript Foundations" })).toBeVisible();
  await page.goto("/courses/typescript-foundations/lessons/why-types");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Why types?" })).toHaveCount(1);

  expect(errors).toEqual([]);
});
