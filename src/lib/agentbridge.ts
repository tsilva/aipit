export function agentBridgeBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const value = (env.AGENTBRIDGE_BASE_URL ?? "http://127.0.0.1:8082/api/v1").replace(/\/+$/, "");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.hostname === "openrouter.ai") {
    throw new Error("Configure an AgentBridge HTTP endpoint.");
  }
  return value;
}

export function agentBridgeModel(model: string): string {
  if (/^(codex|claudecode)\//.test(model) || /^openrouter\/[^/]+\/.+/.test(model) || model === "openrouter/default") return model;
  return `openrouter/${model}`;
}

export function usesProductionProvider(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

export const productionChatModel = "deepseek/deepseek-v4.1-flash";

export function providerBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return usesProductionProvider(env) ? "https://openrouter.ai/api/v1" : agentBridgeBaseUrl(env);
}

export function providerModel(model: string, env: Record<string, string | undefined> = process.env): string {
  if (!usesProductionProvider(env)) return agentBridgeModel(model);
  const direct = model.replace(/^openrouter\//, "");
  if (!/^[^/]+\/[^/]+$/.test(direct) || /^(codex|claudecode)\//.test(direct)) {
    throw new Error("Production requires a direct provider/model identifier.");
  }
  return direct;
}

export function providerApiKey(env: Record<string, string | undefined> = process.env): string {
  if (!usesProductionProvider(env)) return env.AGENTBRIDGE_API_KEY?.trim() || "not-needed";
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("Production requires its own OpenRouter API key.");
  return key;
}
