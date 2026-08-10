import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Provider } from "../types.js";

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

// opencode ignores OPENAI_BASE_URL (its built-in OpenAI provider is hardcoded to api.openai.com),
// so ai-switch cannot redirect it via env vars. Instead it writes/syncs a custom provider entry
// (npm: @ai-sdk/openai-compatible) into ~/.config/opencode/opencode.json and launches with
// `-m ai-switch-<providerName>/<model>`. The path is overridable via AI_SWITCH_OPENCODE_CONFIG
// (used by tests) and otherwise resolves to ~/.config/opencode/opencode.json.
export function resolveOpencodeConfigPath(): string {
  return process.env.AI_SWITCH_OPENCODE_CONFIG || path.join(homedir(), ".config", "opencode", "opencode.json");
}

// opencode -m uses the `provider/model` format and the provider key in opencode.json must be a
// safe id (lowercase, [a-z0-9-]). A provider named "Acme AI" or "My Provider (v2!)" would otherwise
// produce an invalid key / arg. Normalizes the name into a slug; falls back to the provider id
// (always alphanumeric) when the name has no safe characters. The result is prefixed `ai-switch-`.
export function opencodeProviderKey(provider: Provider): string {
  const slug = provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `ai-switch-${slug || provider.id}`;
}

export function buildOpencodeProviderEntry(provider: Provider, model: string): Record<string, unknown> {
  if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
  return {
    npm: "@ai-sdk/openai-compatible",
    name: opencodeProviderKey(provider),
    options: { baseURL: provider.openaiBaseUrl, apiKey: provider.apiKey },
    models: { [model]: { name: model } },
  };
}

export function syncOpencodeProvider(provider: Provider, model: string): void {
  if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
  const cfgPath = resolveOpencodeConfigPath();
  let config: { $schema?: string; provider?: Record<string, unknown> };
  if (existsSync(cfgPath)) {
    const raw = readFileSync(cfgPath, "utf8");
    try {
      config = JSON.parse(raw);
    } catch {
      // Do NOT silently overwrite a corrupt user config — surface a readable error.
      throw new Error(`Não foi possível ler ${cfgPath} — JSON inválido. Corrija o arquivo opencode.json manualmente.`);
    }
  } else {
    config = { $schema: OPENCODE_SCHEMA, provider: {} };
  }
  if (!config.provider) config.provider = {};
  // Idempotent: overwrite only the ai-switch-<slug> key; preserve $schema + all other providers.
  config.provider[opencodeProviderKey(provider)] = buildOpencodeProviderEntry(provider, model);
  mkdirSync(path.dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(config, null, 2));
}
