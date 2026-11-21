import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("shows the hero, course catalog and every section", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("knows where you are");
    await expect(page.getByTestId("hero-demo")).toBeVisible();
    const backdrop = page.getByTestId("knowledge-graph-backdrop");
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveAttribute("aria-hidden", "true");
    const canvasBox = await backdrop.locator("canvas").boundingBox();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(200);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(200);

    await expect(page.getByRole("heading", { name: "Pick a path and start today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Every course, built the same careful way" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Taught by/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Start free. Go Pro/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your next skill/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("knowledge graph backdrop respects reduced motion and does not block scrolling or CTAs", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const backdrop = page.getByTestId("knowledge-graph-backdrop");
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveAttribute("data-reduced", "true");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(backdrop).toBeVisible();
    await page.getByRole("link", { name: "Compare plans" }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("hero preview video mounts the Mux player when clicked", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    const trigger = page.getByTestId("hero-video-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const player = page.locator('[data-testid="hero-video-player"] mux-player');
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute("playback-id", /.+/);
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
