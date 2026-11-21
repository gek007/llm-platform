import { expect, test } from "@playwright/test";

test("signed-out visitors do not see the tutor widget", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Learnly tutor/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Learnly" })).toHaveCount(0);
});

test("anonymous requests to the agent endpoint are rejected with 401", async ({ request }) => {
  const response = await request.post("/eve/learnly/v1/session", {
    data: { message: "hello" },
  });
  expect(response.status()).toBe(401);
});

test("a garbage bearer token is rejected with 401", async ({ request }) => {
  const response = await request.post("/eve/learnly/v1/session", {
    headers: { authorization: "Bearer not-a-real-token" },
    data: { message: "hello" },
  });
  expect(response.status()).toBe(401);
});
