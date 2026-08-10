import type { Provider } from "../types.js";

export function anthropicEnv(provider: Provider): Record<string, string> {
  if (!provider.anthropicBaseUrl) {
    throw new Error("Provedor não tem URL Anthropic configurada");
  }
  return { ANTHROPIC_API_KEY: provider.apiKey, ANTHROPIC_BASE_URL: provider.anthropicBaseUrl };
}

export function openaiEnv(provider: Provider): Record<string, string> {
  if (!provider.openaiBaseUrl) {
    throw new Error("Provedor não tem URL OpenAI configurada");
  }
  return {
    OPENAI_API_KEY: provider.apiKey,
    OPENAI_API_BASE: provider.openaiBaseUrl,
    OPENAI_BASE_URL: provider.openaiBaseUrl,
  };
}

export function copilotEnv(provider: Provider, model: string): Record<string, string> {
  if (!provider.openaiBaseUrl) {
    throw new Error("Provedor não tem URL OpenAI configurada");
  }
  return {
    COPILOT_PROVIDER_BASE_URL: provider.openaiBaseUrl,
    COPILOT_PROVIDER_TYPE: "openai",
    COPILOT_PROVIDER_API_KEY: provider.apiKey,
    COPILOT_MODEL: model,
  };
}
