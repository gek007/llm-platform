import { expect, test } from "@playwright/test";

test("home page renders and hydrates without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page).toHaveTitle("LMS Platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "LMS Platform" }),
  ).toBeVisible();
  for (const name of ["Authentication", "Backend", "Hosting", "Interface"]) {
    await expect(page.getByRole("button", { name })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  }
  expect(errors).toEqual([]);
});

test("stack sections open with the keyboard and the mouse", async ({ page }) => {
  await page.goto("/");

  const auth = page.getByRole("button", { name: "Authentication" });
  const hosting = page.getByRole("button", { name: "Hosting" });

  await page.keyboard.press("Tab");
  await expect(auth).toBeFocused();
  await page.keyboard.press("Space");
  await expect(auth).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "Authentication" })).toContainText(
    "Clerk",
  );

  await hosting.click();
  await expect(hosting).toHaveAttribute("aria-expanded", "true");
  await expect(auth).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Hosting" })).toContainText(
    "Hostinger",
  );
  await expect(page.getByRole("region", { name: "Authentication" })).toHaveCount(0);
});
