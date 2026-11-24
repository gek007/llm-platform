import { expect, test } from "@playwright/test";

// Signed-out flow against the seeded free Hebrew course (convex/lib/seedData.ts).

test("chaptered course groups lessons by chapter and locks the deck for signed-out visitors", async ({ page }) => {
  await page.goto("/courses/digital-safety-basics");
  const outline = page.locator("section[aria-labelledby='outline-heading']");
  await expect(outline.getByRole("region")).toHaveCount(2);

  await outline.getByRole("heading", { level: 3 }).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/courses\/digital-safety-basics\/chapters\/chapter-1$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Sign in to view the slides")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("region", { name: /slides/ })).toHaveCount(0);

  // The chapter sidebar: course, its chapters, and the current chapter's parts.
  const sidebar = page.getByRole("complementary", { name: "Course navigation" });
  const chapters = sidebar.getByRole("navigation", { name: "Chapters" });
  await expect(chapters.locator("a[href$='/chapters/chapter-1'], a[href$='/chapters/chapter-2']")).toHaveCount(2);
  await expect(chapters.locator("[aria-current='page']")).toHaveAttribute("href", /\/chapters\/chapter-1$/);
  await expect(chapters.getByRole("link", { name: "Slides" })).toHaveAttribute("href", "#deck-heading");
  await chapters.locator("a[href$='/chapters/chapter-2']").click();
  await expect(page).toHaveURL(/\/chapters\/chapter-2$/);
  await expect(chapters.locator("[aria-current='page']")).toHaveAttribute("href", /\/chapters\/chapter-2$/);
});

test("slides first: the course page and a lesson page both lead to the chapter's slides", async ({ page }) => {
  await page.goto("/courses/digital-safety-basics");
  const outline = page.locator("section[aria-labelledby='outline-heading']");
  await expect(outline.getByRole("heading", { level: 2, name: "Chapters" })).toBeVisible();
  const firstChapter = outline.getByRole("region").first();
  await expect(firstChapter.getByRole("link", { name: /^Slides: / })).toHaveAttribute("href", /\/chapters\/chapter-1#deck-heading$/);

  // From a lesson: the header names the chapter and links to its slides, and the sidebar is
  // grouped by chapter, each chapter starting with its slides.
  await firstChapter.getByRole("listitem").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/courses\/digital-safety-basics\/lessons\//);
  const header = page.getByRole("article").locator("header");
  await expect(header.getByRole("link", { name: "Chapter slides" })).toHaveAttribute("href", /\/chapters\/chapter-1#deck-heading$/);
  const sidebar = page.getByRole("complementary", { name: "Course outline" });
  await expect(sidebar.getByRole("region")).toHaveCount(2);
  await expect(sidebar.getByRole("link", { name: /^Slides: / })).toHaveCount(2);

  await header.getByRole("link", { name: "Chapter slides" }).click();
  await expect(page).toHaveURL(/\/chapters\/chapter-1#deck-heading$/);
  await expect(page.getByRole("heading", { level: 2, name: "Slides" })).toBeVisible();
});
