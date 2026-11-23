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
});
