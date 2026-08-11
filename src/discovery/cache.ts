import fs from "node:fs";
import path from "node:path";
import type { Model, Provider } from "../types.js";
import { getConfigDir } from "../config/paths.js";
import { pickBaseUrl } from "../tools/url.js";

/** Cache entry for a single provider. `baseUrl` is stored so a stale entry is ignored when the
 *  provider's URL changes (edit) without bumping the id. */
export interface ModelCacheEntry {
  fetchedAt: string; // ISO timestamp
  baseUrl: string;
  models: Model[];
}

export type ModelCache = Record<string, ModelCacheEntry>;

/** 24h in milliseconds. Exported so tests can reason about expiry. */
export const TTL_MS = 24 * 60 * 60 * 1000;

export function getModelsCacheFile(): string {
  return path.join(getConfigDir(), "models-cache.json");
}

/** Reads the whole cache. Returns `{}` when the file is missing or corrupt — cache is best-effort
 *  and must never throw into the calling flow. */
export function readModelCache(): ModelCache {
  const file = getModelsCacheFile();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as ModelCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeModelCache(cache: ModelCache): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = getModelsCacheFile();
  fs.writeFileSync(file, JSON.stringify(cache, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Returns cached models for the provider when the entry exists, the baseUrl still matches, and the
 *  entry is within TTL. Returns `null` otherwise (miss / stale / invalid). */
export function getCachedModels(provider: Provider): Model[] | null {
  const picked = pickBaseUrl(provider);
  if (!picked) return null;
  const entry = readModelCache()[provider.id];
  if (!entry) return null;
  if (entry.baseUrl !== picked.url) return null;
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetchedAt)) return null;
  if (Date.now() - fetchedAt > TTL_MS) return null;
  return entry.models;
}

/** Upserts the provider's cache entry with a fresh `fetchedAt`. Preserves all other providers. */
export function setCachedModels(provider: Provider, models: Model[]): void {
  // Don't cache an empty list — a provider that returns 200 with `data: []` (misconfigured, or a
  // transiently-empty gateway) would otherwise poison the cache for 24h, forcing every "Iniciar
  // Agent" run into the manual-model fallback. Skipping the write lets the next run retry the
  // network instead of silently trusting a known-bad empty result.
  if (models.length === 0) return;
  const picked = pickBaseUrl(provider);
  if (!picked) return; // defensive: nothing to cache without a base URL
  const cache = readModelCache();
  cache[provider.id] = {
    fetchedAt: new Date().toISOString(),
    baseUrl: picked.url,
    models,
  };
  writeModelCache(cache);
}
