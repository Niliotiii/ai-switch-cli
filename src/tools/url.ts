import type { Provider } from "../types.js";

/**
 * True when `value` is a non-empty string that URL() can parse.
 * Empty/whitespace-only input is treated as "no value" (valid) so callers can
 * use it for optional URL fields — they must check non-emptiness separately.
 */
export function isValidUrl(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/** Validate an optional URL field. Returns `true` when valid/empty, an error string otherwise. */
export function validateUrl(value: string): true | string {
  return isValidUrl(value) ? true : "URL inválida";
}

/** Trim + strip trailing slashes. Returns null when the value is empty. */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  return v === "" ? null : v.replace(/\/+$/, "");
}

/** Strip trailing slashes from a non-null URL (used by providers.ts). */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Picks the preferred base URL for discovery/doctor calls, preferring OpenAI shape. */
export function pickBaseUrl(provider: Provider): { url: string; protocol: "anthropic" | "openai" } | null {
  if (provider.openaiBaseUrl) return { url: provider.openaiBaseUrl, protocol: "openai" };
  if (provider.anthropicBaseUrl) return { url: provider.anthropicBaseUrl, protocol: "anthropic" };
  return null;
}
