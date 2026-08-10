import fs from "node:fs";
import type { AppConfig, Provider } from "../types.js";
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
  return { providers: (config.providers ?? []).map(migrateProvider) };
}

export function writeConfig(config: AppConfig): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = getConfigFile();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
