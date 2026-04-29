export const OPENROUTER_MODEL_DEEPSEEK_FLASH = "deepseek/deepseek-v4-flash";
export const OPENROUTER_MODEL_POLISHED = OPENROUTER_MODEL_DEEPSEEK_FLASH;
export const OPENROUTER_MODEL_REASONING = OPENROUTER_MODEL_DEEPSEEK_FLASH;
export const OPENROUTER_MODEL_COMBATIVE = OPENROUTER_MODEL_DEEPSEEK_FLASH;
export const OPENROUTER_MODEL_CONVERSATIONAL = OPENROUTER_MODEL_DEEPSEEK_FLASH;
export const OPENROUTER_MODEL_LIGHTWEIGHT = OPENROUTER_MODEL_DEEPSEEK_FLASH;

export const SUPPORTED_OPENROUTER_MODELS = [
  OPENROUTER_MODEL_DEEPSEEK_FLASH,
] as const;

type SupportedOpenRouterModel = (typeof SUPPORTED_OPENROUTER_MODELS)[number];

export function isSupportedOpenRouterModel(model: string): model is SupportedOpenRouterModel {
  return SUPPORTED_OPENROUTER_MODELS.includes(model as SupportedOpenRouterModel);
}

export function buildOpenRouterModelFallbackOrder(
  model: string,
  _options?: { preferAuthenticSpeech?: boolean },
): string[] {
  void _options;
  const normalizedModel = model.trim();
  return isSupportedOpenRouterModel(normalizedModel) ? [normalizedModel] : [OPENROUTER_MODEL_DEEPSEEK_FLASH];
}
