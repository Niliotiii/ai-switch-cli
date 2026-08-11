import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

let tmpDir: string;

const baseProvider: Provider = {
  id: "p1",
  name: "openference",
  anthropicBaseUrl: null,
  openaiBaseUrl: "https://api.openference.ai/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ai-switch-cache-"));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.AI_SWITCH_CONFIG_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("model cache", () => {
  it("getCachedModels retorna null quando o cache está vazio", async () => {
    const { getCachedModels } = await import("../../src/discovery/cache.js");
    expect(getCachedModels(baseProvider)).toBe(null);
  });

  it("setCachedModels → getCachedModels round-trip, persistido em disco com perms 0600", async () => {
    const { setCachedModels, getCachedModels, getModelsCacheFile } = await import("../../src/discovery/cache.js");
    const models = [{ id: "claude-sonnet-5" }, { id: "gpt-4o" }];
    setCachedModels(baseProvider, models);
    expect(getCachedModels(baseProvider)).toEqual(models);
    const file = getModelsCacheFile();
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.p1.models.map((m: { id: string }) => m.id)).toEqual(["claude-sonnet-5", "gpt-4o"]);
    expect(parsed.p1.baseUrl).toBe("https://api.openference.ai/v1");
  });

  it("cache hit expira após TTL (24h)", async () => {
    const { setCachedModels, getCachedModels } = await import("../../src/discovery/cache.js");
    setCachedModels(baseProvider, [{ id: "m1" }]);
    expect(getCachedModels(baseProvider)).toEqual([{ id: "m1" }]);
    // Avança 24h + 1ms → expira
    vi.setSystemTime(new Date("2026-08-11T12:00:00.001Z"));
    expect(getCachedModels(baseProvider)).toBe(null);
  });

  it("baseUrl diferente (URL editada) → miss, mesmo dentro do TTL", async () => {
    const { setCachedModels, getCachedModels } = await import("../../src/discovery/cache.js");
    setCachedModels(baseProvider, [{ id: "m1" }]);
    const renamed: Provider = { ...baseProvider, openaiBaseUrl: "https://other.api/v1" };
    expect(getCachedModels(renamed)).toBe(null);
    // O provedor original ainda hit
    expect(getCachedModels(baseProvider)).toEqual([{ id: "m1" }]);
  });

  it("readModelCache não lança e getCachedModels retorna null com JSON corrompido", async () => {
    const { getModelsCacheFile, getCachedModels, readModelCache } = await import("../../src/discovery/cache.js");
    const file = getModelsCacheFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{ not valid json ,,, ", "utf-8");
    expect(() => readModelCache()).not.toThrow();
    expect(getCachedModels(baseProvider)).toBe(null);
  });

  it("setCachedModels preserva entradas de outros provedores", async () => {
    const { setCachedModels, getCachedModels, readModelCache } = await import("../../src/discovery/cache.js");
    setCachedModels(baseProvider, [{ id: "a" }]);
    const other: Provider = { ...baseProvider, id: "p2", name: "other", openaiBaseUrl: "https://other/v1" };
    setCachedModels(other, [{ id: "b" }]);
    expect(getCachedModels(baseProvider)).toEqual([{ id: "a" }]);
    expect(getCachedModels(other)).toEqual([{ id: "b" }]);
    expect(Object.keys(readModelCache())).toEqual(["p1", "p2"]);
  });
});
