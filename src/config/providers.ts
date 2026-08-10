import { randomUUID } from "node:crypto";
import type { Provider } from "../types.js";
import { readConfig, writeConfig } from "./store.js";

export function listProviders(): Provider[] {
  return readConfig().providers;
}

export function providerNameExists(name: string): boolean {
  return listProviders().some((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function addProvider(input: {
  name: string;
  anthropicBaseUrl: string | null;
  openaiBaseUrl: string | null;
  apiKey: string;
}): Provider {
  if (providerNameExists(input.name)) {
    throw new Error(`Provider "${input.name}" already exists`);
  }
  if (!input.anthropicBaseUrl && !input.openaiBaseUrl) {
    throw new Error("Informe pelo menos uma URL (Anthropic ou OpenAI)");
  }
  const provider: Provider = {
    id: randomUUID(),
    name: input.name,
    anthropicBaseUrl: input.anthropicBaseUrl ? input.anthropicBaseUrl.replace(/\/+$/, "") : null,
    openaiBaseUrl: input.openaiBaseUrl ? input.openaiBaseUrl.replace(/\/+$/, "") : null,
    apiKey: input.apiKey,
    createdAt: new Date().toISOString(),
  };
  const config = readConfig();
  config.providers.push(provider);
  writeConfig(config);
  return provider;
}

export function getProviderByName(name: string): Provider | undefined {
  return listProviders().find((p) => p.name === name);
}

export function updateProvider(
  id: string,
  changes: { name?: string; anthropicBaseUrl?: string | null; openaiBaseUrl?: string | null; apiKey?: string }
): Provider {
  const config = readConfig();
  const index = config.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider with id "${id}" not found`);
  }
  const current = config.providers[index]!;
  const nextName = changes.name ?? current.name;
  if (changes.name !== undefined && changes.name.toLowerCase() !== current.name.toLowerCase()) {
    const collides = config.providers.some(
      (p, i) => i !== index && p.name.toLowerCase() === nextName.toLowerCase()
    );
    if (collides) {
      throw new Error(`Provider "${nextName}" already exists`);
    }
  }
  const nextAnthropic = changes.anthropicBaseUrl !== undefined ? changes.anthropicBaseUrl : current.anthropicBaseUrl;
  const nextOpenai = changes.openaiBaseUrl !== undefined ? changes.openaiBaseUrl : current.openaiBaseUrl;
  if (!nextAnthropic && !nextOpenai) {
    throw new Error("Informe pelo menos uma URL (Anthropic ou OpenAI)");
  }
  const updated: Provider = {
    ...current,
    name: nextName,
    anthropicBaseUrl: nextAnthropic ? nextAnthropic.replace(/\/+$/, "") : null,
    openaiBaseUrl: nextOpenai ? nextOpenai.replace(/\/+$/, "") : null,
    apiKey: changes.apiKey ?? current.apiKey,
  };
  config.providers[index] = updated;
  writeConfig(config);
  return updated;
}

export function deleteProvider(id: string): Provider {
  const config = readConfig();
  const index = config.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider with id "${id}" not found`);
  }
  const [removed] = config.providers.splice(index, 1);
  writeConfig(config);
  return removed!;
}
