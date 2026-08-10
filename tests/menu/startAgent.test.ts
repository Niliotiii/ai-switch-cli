import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";
import { getAgentDefinition } from "../../src/agents/catalog.js";

vi.mock("../../src/agents/detect.js", () => ({
  detectAgents: vi.fn(() => []),
  isAgentInstalled: vi.fn(() => true),
}));
vi.mock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
vi.mock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [] as Provider[]) }));
vi.mock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn() }));
vi.mock("../../src/config/store.js", () => ({
  getDefaultProviderId: vi.fn(() => null),
  getLastSelection: vi.fn(() => null),
  setLastSelection: vi.fn(),
}));
vi.mock("@inquirer/prompts", () => ({ select: vi.fn(async () => "claude-code") }));

const provider: Provider = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => { vi.clearAllMocks(); });

describe("startToolFlow", () => {
  it("Voltar na seleção do agente cancela o fluxo (não lança)", async () => {
    const { BACK } = await import("../../src/ui/prompts.js");
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("opencode"), installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(BACK);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).not.toHaveBeenCalled();
  });

  it("imprime mensagem clara e retorna quando nenhum agente está instalado", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(logs.join("\n")).toMatch(/Nenhum agente detectado/);
  });

  it("agente env-inject (claude-code) pede provedor e modelo e é lançado com eles", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("claude-code"), installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    // The env-inject flow calls select three times: agent, provider, model.
    // The provider select returns the provider *id* (startTool keys providers by id).
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("claude-code")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("claude-sonnet-5");
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("claude-code"), provider, "claude-sonnet-5");
  });

  it("agente env-inject com requiresModel false (codex) pede provedor mas NÃO pede modelo", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("codex"), installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    // Only TWO select calls: agent, then provider. No model prompt. Provider select returns its id.
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("codex")
      .mockResolvedValueOnce("1");
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { fetchModels } = await import("../../src/discovery/models.js");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(fetchModels).not.toHaveBeenCalled();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("codex"), provider, "");
  });

  it("env-inject: usa promptText (entrada manual) quando fetchModels falha", async () => {
    vi.resetModules();
    const { getAgentDefinition: getDef } = await import("../../src/agents/catalog.js");
    vi.doMock("../../src/agents/detect.js", () => ({ detectAgents: vi.fn(() => [{ definition: getDef("claude-code"), installed: true }]), isAgentInstalled: vi.fn() }));
    vi.doMock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [provider]) }));
    vi.doMock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn(() => Promise.reject(new Error("HTTP 401"))) }));
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack: vi.fn(async (_msg: string, choices: Array<{ value: string }>) => choices[0].value),
      promptText: vi.fn(async () => "manual-model"),
    }));
    vi.doMock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    const { launchAgent } = await import("../../src/agents/launch.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getDef("claude-code"), provider, "manual-model");
    vi.resetModules();
  });
});
