import { randomUUID } from "node:crypto";
import type { Provider } from "../types.js";
import { readConfig, writeConfig } from "./store.js";

export function listProviders(): Provider[] {
  return readConfig().providers;
}

export function providerNameExists(name: string): boolean {
  return listProviders().some((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function addProvider(input: { name: string; baseUrl: string; apiKey: string }): Provider {
  if (providerNameExists(input.name)) {
    throw new Error(`Provider "${input.name}" already exists`);
  }
  const provider: Provider = {
    id: randomUUID(),
    name: input.name,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
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
  changes: { name?: string; baseUrl?: string; apiKey?: string }
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
  const nextBaseUrl =
    changes.baseUrl !== undefined ? changes.baseUrl.replace(/\/+$/, "") : current.baseUrl;
  const updated: Provider = {
    ...current,
    name: nextName,
    baseUrl: nextBaseUrl,
    apiKey: changes.apiKey ?? current.apiKey,
  };
  config.providers[index] = updated;
  writeConfig(config);
  return updated;
}
