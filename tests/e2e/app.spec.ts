import { expect, test, type Page } from "@playwright/test";
import { STARTER_BUNDLES } from "../../src/lib/starter-bundles";

const GLOBAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "global").map((bundle) => bundle.prompt);
const PORTUGAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "portugal").map((bundle) => bundle.prompt);

async function expectStarterPromptFromAudience(page: Page, prompts: string[]) {
  const prompt = await page.locator("#hero-pit-prompt").inputValue();
  expect(prompts).toContain(prompt);
  return prompt;
}

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

test.describe("audience-aware setup", () => {
  test.use({ locale: "en-US" });

  test("defaults non-Portuguese visitors to the global lane", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decline" }).click();

    await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
    await expect(page.getByRole("button", { name: "Global" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Portugal" })).toHaveCount(0);
  });

  test("reroll keeps non-Portuguese visitors out of Portugal starters", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decline" }).click();

    const initialPrompt = await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
    await page.getByRole("button", { name: "Load another starter debate" }).click();
    await expect.poll(async () => page.locator("#hero-pit-prompt").inputValue()).not.toBe(initialPrompt);
    await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
  });
});

test.describe("Portuguese locale defaults", () => {
  test.use({ locale: "pt-PT" });

  test("defaults Portuguese visitors to the Portugal lane", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decline" }).click();

    await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
  });

  test("reroll keeps Portuguese visitors in Portugal starters", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decline" }).click();

    const initialPrompt = await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
    await page.getByRole("button", { name: "Load another starter debate" }).click();
    await expect.poll(async () => page.locator("#hero-pit-prompt").inputValue()).not.toBe(initialPrompt);
    await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
  });
});
