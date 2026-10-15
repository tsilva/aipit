import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/agentbridge.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const provider = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
for (const env of [{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview", NODE_ENV: "development" }]) {
  test(`hosted ${JSON.stringify(env)} never falls back to AgentBridge`, () => {
    const configured = { ...env, OPENROUTER_API_KEY: "production-sentinel", AGENTBRIDGE_API_KEY: "development-sentinel", AGENTBRIDGE_BASE_URL: "http://dev.invalid/api/v1" };
    assert.equal(provider.providerBaseUrl(configured), "https://openrouter.ai/api/v1");
    assert.equal(provider.providerApiKey(configured), "production-sentinel");
    assert.equal(provider.providerModel("deepseek/deepseek-v4.1-flash", configured), "deepseek/deepseek-v4.1-flash");
    assert.equal(provider.providerModel("openai/text-embedding-3-small", configured), "openai/text-embedding-3-small");
    assert.throws(() => provider.providerApiKey({ ...configured, OPENROUTER_API_KEY: " " }), /own OpenRouter/);
    assert.throws(() => provider.providerModel("codex/default", configured));
  });
}
test("development keeps gateway endpoint, model prefix and optional token", () => {
  const env = { NODE_ENV: "development", OPENROUTER_API_KEY: "must-not-be-used", AGENTBRIDGE_BASE_URL: "http://dev.invalid/api/v1/" };
  assert.equal(provider.providerBaseUrl(env), "http://dev.invalid/api/v1");
  assert.equal(provider.providerApiKey(env), "not-needed");
  assert.equal(provider.providerModel("deepseek/deepseek-v4.1-flash", env), "openrouter/deepseek/deepseek-v4.1-flash");
});
