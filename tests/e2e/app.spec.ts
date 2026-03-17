import { expect, test, type Page } from "@playwright/test";
import { PIT_RUN_DEFAULTS } from "../../src/lib/pit";
import { STARTER_BUNDLES } from "../../src/lib/starter-bundles";

const GLOBAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "global").map((bundle) => bundle.prompt);
const PORTUGAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "portugal").map((bundle) => bundle.prompt);

async function expectStarterPromptFromAudience(page: Page, prompts: string[]) {
  const prompt = await page.locator("#hero-pit-prompt").inputValue();
  expect(prompts).toContain(prompt);
  return prompt;
}

async function dismissConsentBannerIfVisible(page: Page) {
  const banner = page.getByRole("dialog", { name: "Analytics consent" });

  try {
    await banner.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }

  await page.getByRole("button", { name: "Decline" }).click();
  await expect(banner).toBeHidden();
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
  const minimumExpectedChatCalls = 1 + (await page.locator(".hero-roster-card").count() - 1) * PIT_RUN_DEFAULTS.rounds + 1;

  await page.getByRole("button", { name: "START", exact: true }).click();

  await expect.poll(() => chatCalls, { timeout: 45_000 }).toBeGreaterThanOrEqual(minimumExpectedChatCalls);
  await expect(page.getByText(/Mock debate line \d+/)).toBeVisible({ timeout: 45_000 });
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

test("keeps an invalid API key editable after failed validation", async ({ page }) => {
  await page.route("**/api/openrouter/key", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Invalid key" },
      }),
    });
  });

  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.getByLabel("OpenRouter API key").fill("bad-key");
  await page.getByRole("button", { name: "Save API key" }).click();

  await expect(page.getByText("This API key is invalid. Add a valid OpenRouter key to run debates.")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue("bad-key");
  await expect(page.getByLabel("OpenRouter API key")).toBeEditable();
  await expect(page.getByRole("button", { name: "Save API key" })).toBeVisible();
});

test("allows clearing a saved personal API key", async ({ page }) => {
  await page.route("**/api/openrouter/key", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { label: "ok" } }),
    });
  });

  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.getByLabel("OpenRouter API key").fill("good-key");
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("OpenRouter API key verified. Selected models are enabled.")).toBeVisible();

  await page.getByRole("button", { name: "Edit API key" }).click();
  await page.getByLabel("OpenRouter API key").fill("");
  await expect(page.getByRole("button", { name: "Save API key" })).toBeVisible();
  await page.getByRole("button", { name: "Save API key" }).click();

  await expect(page.getByText("Usage will be limited if no key is provided.")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue("No personal key");
  await expect(page.getByRole("button", { name: "Edit API key" })).toBeVisible();
});

test("locks background scrolling while the character selector is open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);

  await page.getByRole("button", { name: "Add debater" }).click();
  await expect(page.locator(".character-selector-modal-panel")).toBeVisible();

  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);
});

test("uses the participant terminology in the settings sheet actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.getByRole("button", { name: "Edit Anderson Cooper" }).click();

  await expect(page.getByRole("button", { name: "Close participant settings" })).toBeVisible();
});

test("keeps keyboard focus inside the character selector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.getByRole("button", { name: "Add debater" }).click();
  await expect(page.locator(".character-selector-modal-panel")).toBeVisible();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
  }

  const focusState = await page.evaluate(() => ({
    inModal: !!document.activeElement?.closest(".character-selector-modal-panel"),
  }));

  expect(focusState.inModal).toBe(true);
});

test("resets the scroll position when entering simulation on short screens", async ({ page }) => {
  await page.route("**/api/openrouter/key", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { label: "ok" } }),
    });
  });
  await page.route("**/api/openrouter/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "mock/model",
        choices: [{ message: { content: "Mock line\n<<<BALLOON>>>\nFollow-up line" } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.01,
        },
      }),
    });
  });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await dismissConsentBannerIfVisible(page);

  await page.getByLabel("OpenRouter API key").fill("good-key");
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("OpenRouter API key verified. Selected models are enabled.")).toBeVisible();

  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.locator(".chamber-shell")).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
