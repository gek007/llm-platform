import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("shows the hero, course catalog and every section", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("knows where you are");
    await expect(page.getByTestId("hero-demo")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Pick a path and start today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Every course, built the same careful way" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Taught by/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Start free. Go Pro/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your next skill/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("course cards come from Convex and link to their course page", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator('#courses a[href^="/courses/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);

    const first = cards.first();
    await expect(first).toContainText(/lessons?/);
    await expect(first.getByText(/^(Free|Pro)$/)).toBeVisible();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/courses\/[\w-]+$/);
  });

  test("pricing teaser leads to /pricing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Compare plans" }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("works at phone width without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
