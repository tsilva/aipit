import { expect, test } from "@playwright/test";

test("gates analytics by consent and completes a mocked debate", async ({ page }) => {
  let chatCalls = 0;

  await page.route("**/api/openrouter/chat/completions", async (route) => {
    chatCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "mock/model",
        choices: [
          {
            message: {
              content: `Mock debate line ${chatCalls}\n<<<BALLOON>>>\nFollow-up line ${chatCalls}`,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.01,
        },
      }),
    });
  });

  await page.goto("/");

  await expect(page.locator('script[src*="googletagmanager.com/gtag/js"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.locator('script[src*="googletagmanager.com/gtag/js"]')).toHaveCount(1);

  await page.getByRole("button", { name: "START", exact: true }).click();

  await expect.poll(() => chatCalls, { timeout: 45_000 }).toBeGreaterThanOrEqual(9);
  await expect(page.getByText("Mock debate line 1")).toBeVisible({ timeout: 45_000 });
});

test("shows a recoverable upstream failure message", async ({ page }) => {
  await page.route("**/api/openrouter/chat/completions", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Failed to reach OpenRouter." },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByRole("button", { name: "START", exact: true }).click();

  await expect(page.getByText("Failed to reach OpenRouter.")).toBeVisible({ timeout: 30_000 });
});
