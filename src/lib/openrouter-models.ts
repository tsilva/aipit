export const OPENROUTER_MODEL_POLISHED = "anthropic/claude-sonnet-4.6";
export const OPENROUTER_MODEL_REASONING = "deepseek/deepseek-v3.2";
export const OPENROUTER_MODEL_COMBATIVE = "x-ai/grok-4.1-fast";
export const OPENROUTER_MODEL_CONVERSATIONAL = "google/gemini-3-flash-preview";
export const OPENROUTER_MODEL_LIGHTWEIGHT = "google/gemini-3.1-flash-lite-preview";

export const SUPPORTED_OPENROUTER_MODELS = [
  OPENROUTER_MODEL_POLISHED,
  OPENROUTER_MODEL_REASONING,
  OPENROUTER_MODEL_COMBATIVE,
  OPENROUTER_MODEL_CONVERSATIONAL,
  OPENROUTER_MODEL_LIGHTWEIGHT,
] as const;

type SupportedOpenRouterModel = (typeof SUPPORTED_OPENROUTER_MODELS)[number];

export function isSupportedOpenRouterModel(model: string): model is SupportedOpenRouterModel {
  return SUPPORTED_OPENROUTER_MODELS.includes(model as SupportedOpenRouterModel);
}

export function buildOpenRouterModelFallbackOrder(
  model: string,
  options?: { preferAuthenticSpeech?: boolean },
): string[] {
  const normalizedModel = model.trim();
  const fallbackOrder = normalizedModel ? [normalizedModel] : [];
  const candidatePool = options?.preferAuthenticSpeech
    ? [
        OPENROUTER_MODEL_COMBATIVE,
        OPENROUTER_MODEL_CONVERSATIONAL,
        OPENROUTER_MODEL_REASONING,
        OPENROUTER_MODEL_POLISHED,
        OPENROUTER_MODEL_LIGHTWEIGHT,
      ]
    : [...SUPPORTED_OPENROUTER_MODELS];

  for (const candidate of candidatePool) {
    if (candidate !== normalizedModel) {
      fallbackOrder.push(candidate);
    }
  }

  return fallbackOrder;
}
