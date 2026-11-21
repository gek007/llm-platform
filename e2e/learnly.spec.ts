import { expect, test } from "@playwright/test";

test("Learnly eve agent health endpoint responds through Next.js", async ({
  request,
}) => {
  const response = await request.get("/eve/learnly/v1/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body).toMatchObject({
    ok: true,
    status: "ready",
  });
});

test("signed-out visitors are redirected from /learnly to sign-in", async ({
  page,
}) => {
  await page.goto("/learnly");
  await expect(page).toHaveURL(/sign-in/);
});
