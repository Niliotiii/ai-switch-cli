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
