import fs from "node:fs";
import type { AppConfig, LastSelection, Provider } from "../types.js";
import { getConfigDir, getConfigFile } from "./paths.js";

type LegacyProvider = Partial<Provider> & { baseUrl?: string };

function migrateProvider(p: LegacyProvider): Provider {
  if (p.anthropicBaseUrl !== undefined && p.openaiBaseUrl !== undefined) {
    return p as Provider;
  }
  const baseUrl = p.baseUrl ?? null;
  return {
    id: p.id!,
    name: p.name!,
    anthropicBaseUrl: p.anthropicBaseUrl ?? baseUrl,
    openaiBaseUrl: p.openaiBaseUrl ?? baseUrl,
    apiKey: p.apiKey!,
    createdAt: p.createdAt!,
  };
}

export function readConfig(): AppConfig {
  const file = getConfigFile();
  if (!fs.existsSync(file)) {
    return { providers: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { providers: [] };
  }
  const config = parsed as AppConfig;
  return {
    providers: (config.providers ?? []).map(migrateProvider),
    ...(config.defaultProviderId !== undefined ? { defaultProviderId: config.defaultProviderId } : {}),
    ...(config.lastSelection !== undefined ? { lastSelection: config.lastSelection } : {}),
  };
}

export function writeConfig(config: AppConfig): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = getConfigFile();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Returns the configured default provider id, or null. Validates the provider still exists. */
export function getDefaultProviderId(): string | null {
  const { defaultProviderId, providers } = readConfig();
  if (!defaultProviderId) return null;
  return providers.some((p) => p.id === defaultProviderId) ? defaultProviderId : null;
}

/** Sets (or clears with null) the default provider id. Throws if the id is unknown (when non-null). */
export function setDefaultProviderId(id: string | null): void {
  const config = readConfig();
  if (id !== null && !config.providers.some((p) => p.id === id)) {
    throw new Error(`Provider with id "${id}" not found`);
  }
  config.defaultProviderId = id;
  writeConfig(config);
}

/** Returns the last agent/provider/model combination launched, or null. */
export function getLastSelection(): LastSelection | null {
  return readConfig().lastSelection ?? null;
}

/** Persists the last launched combination. Silently ignores unknown provider ids. */
export function setLastSelection(selection: LastSelection): void {
  const config = readConfig();
  config.lastSelection = selection;
  writeConfig(config);
}
