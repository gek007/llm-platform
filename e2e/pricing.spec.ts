import { expect, test } from "@playwright/test";

test.describe("pricing page", () => {
  test("shows Free and Pro plans and the FAQ", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Simple pricing");
    await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions, answered" })).toBeVisible();
  });

  test("the billing toggle changes the Pro price", async ({ page }) => {
    await page.goto("/pricing");
    const price = page.getByTestId("pro-price");
    await expect(price).toContainText("$190");
    await page.getByRole("radio", { name: "Monthly" }).click();
    await expect(price).toContainText("$19");
    await expect(price).toContainText("per month");
    await page.getByRole("radio", { name: "Yearly" }).click();
    await expect(price).toContainText("$190");
  });

  test("signed-out users are asked to sign in to upgrade", async ({ page }) => {
    await page.goto("/pricing");
    const cta = page.getByRole("button", { name: "Sign in to upgrade" });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("FAQ items open", async ({ page }) => {
    await page.goto("/pricing");
    const trigger = page.getByRole("button", { name: "How does yearly billing work?" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
