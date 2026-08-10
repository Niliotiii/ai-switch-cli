import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

const provider: Provider = {
  id: "1",
  name: "openrouter",
  anthropicBaseUrl: "https://anthropic.example.com",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
