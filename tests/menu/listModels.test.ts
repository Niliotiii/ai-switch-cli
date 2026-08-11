import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

const provider: Provider = {
  id: "p1",
  name: "openference",
  anthropicBaseUrl: null,
  openaiBaseUrl: "https://api.openference.ai/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const setCachedModels = vi.fn();

vi.mock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [provider]) }));
vi.mock("../../src/discovery/models.js", () => ({
  // "Ver Modelos" bypassa o cache e chama fetchModels (rede) diretamente.
  fetchModels: vi.fn(),
}));
vi.mock("../../src/discovery/cache.js", () => ({ setCachedModels }));
vi.mock("../../src/ui/prompts.js", () => ({
  promptChoiceWithBack: vi.fn(async () => provider.name),
}));
vi.mock("../../src/ui/table.js", () => ({ renderTable: vi.fn(() => "TABLE") }));
vi.mock("../../src/ui/theme.js", () => ({
  theme: { heading: (s: string) => s, fail: (s: string) => s, ok: (s: string) => s, dim: (s: string) => s },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listModelsFlow", () => {
  it("refaz a rede (fetchModels) e atualiza o cache (setCachedModels) ao mostrar modelos", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { listModelsFlow } = await import("../../src/menu/listModels.js");

    await listModelsFlow();

    expect(fetchModels).toHaveBeenCalledWith(provider);
    expect(setCachedModels).toHaveBeenCalledWith(provider, [{ id: "claude-sonnet-5" }]);
    expect(logs.join("\n")).toContain("TABLE");
  });

  it("não atualiza o cache quando fetchModels falha", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HTTP 429"));
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { listModelsFlow } = await import("../../src/menu/listModels.js");

    await listModelsFlow();

    expect(setCachedModels).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("HTTP 429");
  });

  it("mostra aviso e retorna quando não há provedores cadastrados", async () => {
    vi.doMock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => []) }));
    vi.resetModules();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { listModelsFlow } = await import("../../src/menu/listModels.js");
    await listModelsFlow();
    expect(logs.join("\n")).toMatch(/Nenhum provedor cadastrado/);
    vi.resetModules();
  });
});
