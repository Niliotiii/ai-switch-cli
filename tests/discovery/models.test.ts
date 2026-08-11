import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Provider } from "../../src/types.js";

const provider: Provider = {
  id: "1",
  name: "openrouter",
  anthropicBaseUrl: "https://anthropic.example.com",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

let tmpDir: string | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (tmpDir) {
    delete process.env.AI_SWITCH_CONFIG_DIR;
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function isolateConfigDir(): string {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ai-switch-models-"));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
  return tmpDir;
}

describe("fetchModels", () => {
  it("fetches, sorts and maps the model list against the OpenAI URL, sending a Bearer token", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "z-model" }, { id: "a-model" }] }),
    });

    const { fetchModels } = await import("../../src/discovery/models.js");
    const models = await fetchModels(provider);

    expect(fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: "Bearer sk-x" },
    });
    expect(models).toEqual([{ id: "a-model" }, { id: "z-model" }]);
  });

  it("falls back to the Anthropic URL with x-api-key headers when openaiBaseUrl is null", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "claude-3" }] }),
    });

    const { fetchModels } = await import("../../src/discovery/models.js");
    const anthropicOnly: Provider = { ...provider, openaiBaseUrl: null };
    await fetchModels(anthropicOnly);

    expect(fetch).toHaveBeenCalledWith("https://anthropic.example.com/models", {
      headers: { "x-api-key": "sk-x", "anthropic-version": "2023-06-01" },
    });
  });

  it("throws /Nenhuma URL/ when both URLs are null", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    const noUrl: Provider = { ...provider, anthropicBaseUrl: null, openaiBaseUrl: null };
    await expect(fetchModels(noUrl)).rejects.toThrow(/Nenhuma URL/);
  });

  it("throws a readable error on non-ok response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
    const { fetchModels } = await import("../../src/discovery/models.js");
    await expect(fetchModels(provider)).rejects.toThrow(/HTTP 401/);
  });
});

describe("getModels (cache-first)", () => {
  it("retorna do cache sem chamar fetch quando há hit", async () => {
    isolateConfigDir();
    const { getModels } = await import("../../src/discovery/models.js");
    const { setCachedModels } = await import("../../src/discovery/cache.js");
    setCachedModels(provider, [{ id: "cached-model" }]);

    const models = await getModels(provider);

    expect(models).toEqual([{ id: "cached-model" }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("em miss, chama fetch, grava o cache e retorna a lista ordenada", async () => {
    isolateConfigDir();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "z-model" }, { id: "a-model" }] }),
    });
    const { getModels } = await import("../../src/discovery/models.js");
    const { getCachedModels } = await import("../../src/discovery/cache.js");

    const models = await getModels(provider);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(models).toEqual([{ id: "a-model" }, { id: "z-model" }]);
    // segundo call usa o cache — fetch não é chamado de novo
    (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    const again = await getModels(provider);
    expect(again).toEqual([{ id: "a-model" }, { id: "z-model" }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(getCachedModels(provider)).toEqual([{ id: "a-model" }, { id: "z-model" }]);
  });

  it("propaga o erro do fetch em miss (sem escrever cache)", async () => {
    isolateConfigDir();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    const { getModels } = await import("../../src/discovery/models.js");
    const { getCachedModels } = await import("../../src/discovery/cache.js");
    await expect(getModels(provider)).rejects.toThrow(/HTTP 429/);
    expect(getCachedModels(provider)).toBe(null);
  });
});
