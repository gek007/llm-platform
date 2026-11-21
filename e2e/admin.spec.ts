import { expect, test } from "@playwright/test";

test("signed-out visitors are redirected from /admin to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/sign-in/);
});

test("signed-out visitors are redirected from a nested admin route", async ({ page }) => {
  await page.goto("/admin/courses/new");
  await expect(page).toHaveURL(/sign-in/);
});
