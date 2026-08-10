import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

vi.mock("../../src/agents/detect.js", () => ({
  isAgentInstalled: vi.fn(() => true),
  detectAgents: vi.fn(),
}));

vi.mock("../../src/discovery/models.js", () => ({
  fetchModels: vi.fn(),
}));

const provider: Provider = {
  id: "1",
  name: "openrouter",
  anthropicBaseUrl: "https://anthropic.example.com",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("doctor checks", () => {
  it("checkAgents retorna um resultado por agente do catálogo, todos ok quando isAgentInstalled é true", async () => {
    const { checkAgents } = await import("../../src/doctor/checks.js");
    const results = checkAgents();
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("checkProvider returns ok and reports the OpenAI protocol with model count", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider(provider);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/via OpenAI/);
    expect(result.detail).toMatch(/2 modelo/);
  });

  it("checkProvider reports the Anthropic protocol when only anthropicBaseUrl is set", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-3" }]);
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider({ ...provider, openaiBaseUrl: null });
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/via Anthropic/);
  });

  it("checkProvider returns ok:false 'nenhuma URL configurada' when both URLs are null", async () => {
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider({ ...provider, anthropicBaseUrl: null, openaiBaseUrl: null });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/nenhuma URL configurada/);
  });

  it("checkProvider returns ok:false with the error message on failure", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HTTP 401"));
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider(provider);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("HTTP 401");
  });

  it("runDoctor combina checagens de agente e de provedor", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { runDoctor } = await import("../../src/doctor/checks.js");
    const results = await runDoctor([provider]);
    expect(results).toHaveLength(6); // 5 agentes + 1 provedor
  });
});
