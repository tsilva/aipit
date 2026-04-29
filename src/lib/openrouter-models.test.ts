import { describe, expect, it } from "vitest";
import {
  OPENROUTER_MODEL_DEEPSEEK_FLASH,
  OPENROUTER_MODEL_REASONING,
  buildOpenRouterModelFallbackOrder,
} from "@/lib/openrouter-models";

describe("openrouter model fallback order", () => {
  it("returns the single supported model for authentic participant speech", () => {
    expect(
      buildOpenRouterModelFallbackOrder(OPENROUTER_MODEL_REASONING, {
        preferAuthenticSpeech: true,
      }),
    ).toEqual([OPENROUTER_MODEL_DEEPSEEK_FLASH]);
  });

  it("returns the single supported model when authentic-speech preference is off", () => {
    expect(buildOpenRouterModelFallbackOrder(OPENROUTER_MODEL_REASONING)).toEqual([OPENROUTER_MODEL_DEEPSEEK_FLASH]);
  });

  it("normalizes unsupported model requests to the single supported model", () => {
    expect(buildOpenRouterModelFallbackOrder("unsupported/model")).toEqual([OPENROUTER_MODEL_DEEPSEEK_FLASH]);
  });
});
