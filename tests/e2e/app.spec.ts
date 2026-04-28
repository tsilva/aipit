import { expect, test, type Page } from "@playwright/test";
import {
  SIMULATION_ACKNOWLEDGEMENT_KEY,
  SIMULATION_ACKNOWLEDGEMENT_VALUE,
} from "../../src/lib/simulation-acknowledgement";
import { STARTER_BUNDLES } from "../../src/lib/starter-bundles";

const GLOBAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "global").map((bundle) => bundle.prompt);
const PORTUGAL_STARTER_PROMPTS = STARTER_BUNDLES.filter((bundle) => bundle.audience === "portugal").map((bundle) => bundle.prompt);

function getStartButton(page: Page) {
  return page.getByRole("button", { name: /Start debate arena|Starting debate arena/ });
}

function getSaveKeyButton(page: Page) {
  return page.getByRole("button", { name: /Save (API )?key/ });
}

async function openApiKeyEditor(page: Page) {
  const input = page.getByLabel("OpenRouter API key");
  const manageButton = page.getByRole("button", { name: "Manage in settings" });

  if (await manageButton.isVisible().catch(() => false)) {
    await manageButton.click();
  }

  await expect(getSaveKeyButton(page)).toBeVisible();
  await expect(input).toBeEditable();
  return input;
}

async function expectStarterPromptFromAudience(page: Page, prompts: string[]) {
  const prompt = await page.locator("#hero-pit-prompt").inputValue();
  expect(prompts).toContain(prompt);
  return prompt;
}

async function acknowledgeSimulationNoticeIfVisible(page: Page) {
  const gate = page.getByRole("dialog", { name: "AI simulation notice" });

  try {
    await gate.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }

  await page.getByRole("button", { name: "I understand and agree" }).click();
  await expect(gate).toBeHidden();
}

async function dismissConsentBannerIfVisible(page: Page) {
  const banner = page.getByRole("dialog", { name: "Telemetry consent" });

  try {
    await banner.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }

  await page.getByRole("button", { name: "Decline" }).click();
  await expect(banner).toBeHidden();
}

async function ensureRunCanStart(page: Page) {
  const startButton = getStartButton(page);

  if (await startButton.isEnabled()) {
    return;
  }

  await page.route("**/api/openrouter/key", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { label: "ok" } }),
    });
  });

  await (await openApiKeyEditor(page)).fill("good-key");
  await getSaveKeyButton(page).click();
  await expect(startButton).toBeEnabled();
}

async function advanceToLastBubble(page: Page) {
  const nextButton = page.getByRole("button", { name: "Next speech bubble" });

  for (let step = 0; step < 48; step += 1) {
    if (await page.getByRole("button", { name: "Share" }).isVisible().catch(() => false)) {
      return;
    }

    if (!(await nextButton.isVisible().catch(() => false))) {
      break;
    }

    if (!(await nextButton.isEnabled().catch(() => false))) {
      await page.waitForTimeout(250);
      continue;
    }

    await nextButton.click();
  }
}

test("requires simulation acknowledgement before using the site", async ({ page }) => {
  await page.goto("/");

  const gate = page.getByRole("dialog", { name: "AI simulation notice" });
  await expect(gate).toBeVisible();
  await expect(page.getByRole("button", { name: "I understand and agree" })).toBeFocused();
  await expect(page.getByText("not real quotes, endorsements, beliefs")).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/legal#terms");
  await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute(
    "href",
    "/legal#privacy",
  );

  let blockedStartClick = false;
  try {
    await getStartButton(page).click({ timeout: 1_000 });
  } catch {
    blockedStartClick = true;
  }
  expect(blockedStartClick).toBe(true);

  await page.getByRole("button", { name: "I understand and agree" }).click();
  await expect(gate).toBeHidden();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SIMULATION_ACKNOWLEDGEMENT_KEY)).toBe(
    SIMULATION_ACKNOWLEDGEMENT_VALUE,
  );

  await page.reload();
  await expect(gate).toBeHidden();
});

test("allows legal pages to be read before acknowledgement", async ({ page }) => {
  await page.goto("/legal");

  await expect(page.getByRole("dialog", { name: "AI simulation notice" })).toBeHidden();
  await expect(page.getByRole("heading", { name: /Terms & privacy/i })).toBeVisible();
  await expect(page.getByText("unlisted, not private").first()).toBeVisible();
});

test("sends users to Google when the simulation notice is rejected", async ({ page }) => {
  await page.route("https://www.google.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><title>Google</title><body>Google</body></html>",
    });
  });

  await page.goto("/");

  const gate = page.getByRole("dialog", { name: "AI simulation notice" });
  await expect(gate).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SIMULATION_ACKNOWLEDGEMENT_KEY)).toBeNull();

  await page.getByRole("button", { name: "Leave site" }).click();
  await page.waitForURL("https://www.google.com/");

  await page.goto("/");
  await expect(gate).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SIMULATION_ACKNOWLEDGEMENT_KEY)).toBeNull();
});

test("gates telemetry by consent and completes a mocked debate", async ({ page }) => {
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
  await acknowledgeSimulationNoticeIfVisible(page);
  const acceptTelemetryButton = page.getByRole("button", { name: "Accept" });
  if (await acceptTelemetryButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await acceptTelemetryButton.click();
    await expect(page.locator('script[src*="googletagmanager.com/gtag/js"]')).toHaveCount(1);
  }
  await ensureRunCanStart(page);

  await getStartButton(page).click();

  await expect.poll(() => chatCalls, { timeout: 45_000 }).toBeGreaterThan(0);
  await expect(page.getByText(/Mock debate line \d+/)).toBeVisible({ timeout: 45_000 });
  await advanceToLastBubble(page);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible({ timeout: 45_000 });
});

test("allows telemetry preferences to be changed after the banner is gone", async ({ page }) => {
  await page.goto("/");
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await page.getByRole("button", { name: "Privacy preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Privacy preferences" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("switch", { name: /Google Analytics/ })).not.toBeChecked();
  await dialog.getByRole("switch", { name: /Google Analytics/ }).check();
  await expect(dialog.getByRole("switch", { name: /Google Analytics/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Disable both" }).click();
  await expect(dialog.getByRole("switch", { name: /Google Analytics/ })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
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
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);
  await ensureRunCanStart(page);
  await getStartButton(page).click();

  await expect(page.getByText("Failed to reach OpenRouter.")).toBeVisible({ timeout: 30_000 });
});

test("creates a share link after a mocked debate finishes", async ({ page }) => {
  let chatCalls = 0;
  let shareCalls = 0;

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
              content: `Shareable debate line ${chatCalls}\n<<<BALLOON>>>\nShareable follow-up ${chatCalls}`,
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
  await page.route("**/api/share", async (route) => {
    shareCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slug: "mock-share-1",
        url: "http://127.0.0.1:3000/s/mock-share-1",
      }),
    });
  });

  await page.goto("/");
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);
  await ensureRunCanStart(page);

  await getStartButton(page).click();
  await expect.poll(() => chatCalls, { timeout: 45_000 }).toBeGreaterThan(0);
  await advanceToLastBubble(page);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("dialog", { name: "Create a public replay link?" })).toBeVisible();
  await expect(page.getByText("Public replay links are unlisted, not private.")).toBeVisible();
  await page.getByRole("button", { name: "Create public replay link" }).click();

  await expect.poll(() => shareCalls).toBe(1);
  await expect(page.getByRole("button", { name: /Link copied|Copy link/ })).toBeVisible();
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
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await (await openApiKeyEditor(page)).fill("bad-key");
  await getSaveKeyButton(page).click();

  await expect(page.getByText("This API key is invalid. Add a valid OpenRouter key to run debates.")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue("bad-key");
  await expect(page.getByLabel("OpenRouter API key")).toBeEditable();
  await expect(getSaveKeyButton(page)).toBeVisible();
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
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await (await openApiKeyEditor(page)).fill("good-key");
  await getSaveKeyButton(page).click();
  await expect(page.getByText("OpenRouter API key verified. Selected models are enabled.")).toBeVisible();

  await page.getByRole("button", { name: "Manage in settings" }).click();
  await page.getByLabel("OpenRouter API key").fill("");
  await expect(getSaveKeyButton(page)).toBeVisible();
  await getSaveKeyButton(page).click();

  await expect(page.getByText("Usage will be limited if no key is provided.")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Manage in settings" })).toBeVisible();
});

test("locks background scrolling while the character selector is open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await acknowledgeSimulationNoticeIfVisible(page);
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
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await page.getByRole("button", { name: /^Edit / }).first().click();

  await expect(page.getByRole("button", { name: "Close participant settings" })).toBeVisible();
});

test("keeps keyboard focus inside the character selector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await acknowledgeSimulationNoticeIfVisible(page);
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
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await (await openApiKeyEditor(page)).fill("good-key");
  await getSaveKeyButton(page).click();
  await expect(page.getByText("OpenRouter API key verified. Selected models are enabled.")).toBeVisible();

  await getStartButton(page).click();
  await expect(page.locator(".chamber-shell")).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("shows a notice when an old shared replay link is unsupported", async ({ page }) => {
  await page.goto("/?share=unsupported");
  await acknowledgeSimulationNoticeIfVisible(page);
  await dismissConsentBannerIfVisible(page);

  await expect(page.getByText("This shared conversation is no longer supported by the current version of aipit.")).toBeVisible();
});

test.describe("audience-aware setup", () => {
  test.use({ locale: "en-US" });

  test("defaults non-Portuguese visitors to the global lane", async ({ page }) => {
    await page.goto("/");
    await acknowledgeSimulationNoticeIfVisible(page);
    await dismissConsentBannerIfVisible(page);

    await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
    await expect(page.locator("main").getByRole("button", { name: "Global" })).toHaveCount(0);
    await expect(page.locator("main").getByRole("button", { name: "Portugal" })).toHaveCount(0);
  });

  test("reroll keeps non-Portuguese visitors out of Portugal starters", async ({ page }) => {
    await page.goto("/");
    await acknowledgeSimulationNoticeIfVisible(page);
    await dismissConsentBannerIfVisible(page);

    const initialPrompt = await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
    await page.getByRole("button", { name: "Shuffle starter debate" }).click();
    await expect.poll(async () => page.locator("#hero-pit-prompt").inputValue()).not.toBe(initialPrompt);
    await expectStarterPromptFromAudience(page, GLOBAL_STARTER_PROMPTS);
  });
});

test.describe("Portuguese locale defaults", () => {
  test.use({ locale: "pt-PT" });

  test("defaults Portuguese visitors to the Portugal lane", async ({ page }) => {
    await page.goto("/");
    await acknowledgeSimulationNoticeIfVisible(page);
    await dismissConsentBannerIfVisible(page);

    await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
  });

  test("reroll keeps Portuguese visitors in Portugal starters", async ({ page }) => {
    await page.goto("/");
    await acknowledgeSimulationNoticeIfVisible(page);
    await dismissConsentBannerIfVisible(page);

    const initialPrompt = await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
    await page.getByRole("button", { name: "Shuffle starter debate" }).click();
    await expect.poll(async () => page.locator("#hero-pit-prompt").inputValue()).not.toBe(initialPrompt);
    await expectStarterPromptFromAudience(page, PORTUGAL_STARTER_PROMPTS);
  });
});
