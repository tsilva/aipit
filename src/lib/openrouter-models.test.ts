import { describe, expect, it } from "vitest";
import {
  OPENROUTER_MODEL_COMBATIVE,
  OPENROUTER_MODEL_CONVERSATIONAL,
  OPENROUTER_MODEL_LIGHTWEIGHT,
  OPENROUTER_MODEL_POLISHED,
  OPENROUTER_MODEL_REASONING,
  buildOpenRouterModelFallbackOrder,
} from "@/lib/openrouter-models";

describe("openrouter model fallback order", () => {
  it("prefers style-preserving models for authentic participant speech", () => {
    expect(
      buildOpenRouterModelFallbackOrder(OPENROUTER_MODEL_REASONING, {
        preferAuthenticSpeech: true,
      }),
    ).toEqual([
      OPENROUTER_MODEL_REASONING,
      OPENROUTER_MODEL_COMBATIVE,
      OPENROUTER_MODEL_CONVERSATIONAL,
      OPENROUTER_MODEL_POLISHED,
      OPENROUTER_MODEL_LIGHTWEIGHT,
    ]);
  });

  it("preserves the general supported order when authentic-speech preference is off", () => {
    expect(buildOpenRouterModelFallbackOrder(OPENROUTER_MODEL_REASONING)).toEqual([
      OPENROUTER_MODEL_REASONING,
      OPENROUTER_MODEL_POLISHED,
      OPENROUTER_MODEL_COMBATIVE,
      OPENROUTER_MODEL_CONVERSATIONAL,
      OPENROUTER_MODEL_LIGHTWEIGHT,
    ]);
  });
});
