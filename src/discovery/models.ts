import type { Model, Provider } from "../types.js";
import { pickBaseUrl } from "../tools/url.js";
import { getCachedModels, setCachedModels } from "./cache.js";

const ANTHROPIC_VERSION = "2023-06-01";

function authHeaders(provider: Provider, protocol: "anthropic" | "openai"): Record<string, string> {
  // Anthropic's API uses x-api-key + anthropic-version, NOT Bearer tokens. Many Anthropic-compatible
  // gateways reject Authorization: Bearer with 401, which previously forced every Anthropic-only
  // provider into the manual-model fallback. OpenAI-compatible endpoints use Authorization: Bearer.
  if (protocol === "anthropic") {
    return { "x-api-key": provider.apiKey, "anthropic-version": ANTHROPIC_VERSION };
  }
  return { Authorization: `Bearer ${provider.apiKey}` };
}

export async function fetchModels(provider: Provider): Promise<Model[]> {
  const picked = pickBaseUrl(provider);
  if (!picked) {
    throw new Error("Nenhuma URL configurada para este provedor");
  }
  const { url, protocol } = picked;
  const response = await fetch(`${url}/models`, {
    headers: authHeaders(provider, protocol),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  const data = body.data ?? [];
  return data.map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Cache-first model lookup used by the "Iniciar Agent" flow. Returns the on-disk cache when it's
 * fresh (within TTL and matching baseUrl), avoiding a network round-trip that would otherwise hit
 * `GET /models` on every launch — the main cause of HTTP 429 when a provider rate-limits that
 * endpoint. On a miss it fetches, persists the result, and returns it. "Ver Modelos" (listModels)
 * intentionally bypasses this and calls `fetchModels` directly so it stays the explicit refresh.
 */
export async function getModels(provider: Provider): Promise<Model[]> {
  const cached = getCachedModels(provider);
  if (cached) return cached;
  const models = await fetchModels(provider);
  setCachedModels(provider, models);
  return models;
}
