import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";
import { getAgentDefinition } from "../../src/agents/catalog.js";

vi.mock("../../src/agents/detect.js", () => ({
  detectAgents: vi.fn(() => []),
  isAgentInstalled: vi.fn(() => true),
}));
vi.mock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
vi.mock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [] as Provider[]) }));
vi.mock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn(), getModels: vi.fn() }));
vi.mock("../../src/config/store.js", () => ({
  getLastSelection: vi.fn(() => null),
  setLastSelection: vi.fn(),
}));
vi.mock("@inquirer/prompts", () => ({ select: vi.fn(async () => "claude-code"), confirm: vi.fn(async () => false) }));

const provider: Provider = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(async () => {
  vi.clearAllMocks();
  // lastSkipByAgent is module-scoped in startTool and would otherwise leak between cases.
  const { __resetSkipForTests } = await import("../../src/menu/startTool.js");
  __resetSkipForTests();
});

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
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("claude-code"), provider, "claude-sonnet-5", { skipPermissions: false });
  });

  it("agente com suporte a skip (claude-code): promptConfirm=true → launchAgent com { skipPermissions: true }", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("claude-code"), installed: true },
    ]);
    const { select, confirm } = await import("@inquirer/prompts");
    // Flow order: select(agent) → confirm(skip) → select(provider) → select(model).
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("claude-code")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("claude-sonnet-5");
    (confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("claude-code"), provider, "claude-sonnet-5", { skipPermissions: true });
  });

  it("copilot agora SUPORTA skip (--yolo): promptConfirm é chamado e, se true, launchAgent com { skipPermissions: true }", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("copilot"), installed: true },
    ]);
    const { select, confirm } = await import("@inquirer/prompts");
    // copilot requires a model: select(agent) → confirm(skip) → select(provider) → select(model).
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("copilot")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("gpt-4o");
    (confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "gpt-4o" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("copilot"), provider, "gpt-4o", { skipPermissions: true });
  });

  it("agente SEM skipPermissionsArgs (faked): promptConfirm NÃO é chamado e launchAgent com { skipPermissions: false }", async () => {
    // None of the real agents lack skipPermissionsArgs anymore, so fake a definition (passed via
    // detectAgents) to guard the "don't ask when unsupported" behavior. askSkipPermissions now takes
    // the full definition, so no catalog mock is needed.
    const { detectAgents } = await import("../../src/agents/detect.js");
    const full = getAgentDefinition("copilot");
    const noSkip = { ...full, skipPermissionsArgs: undefined };
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: noSkip, installed: true },
    ]);
    const { select, confirm } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("copilot")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("gpt-4o");
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "gpt-4o" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(confirm).not.toHaveBeenCalled();
    expect(launchAgent).toHaveBeenCalledWith(noSkip, provider, "gpt-4o", { skipPermissions: false });
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
    const { getModels } = await import("../../src/discovery/models.js");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(getModels).not.toHaveBeenCalled();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("codex"), provider, "", { skipPermissions: false });
  });

  it("env-inject: usa promptText (entrada manual) quando getModels falha", async () => {
    vi.resetModules();
    const { getAgentDefinition: getDef } = await import("../../src/agents/catalog.js");
    vi.doMock("../../src/agents/detect.js", () => ({ detectAgents: vi.fn(() => [{ definition: getDef("claude-code"), installed: true }]), isAgentInstalled: vi.fn() }));
    vi.doMock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [provider]) }));
    vi.doMock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn(), getModels: vi.fn(() => Promise.reject(new Error("HTTP 401"))) }));
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack: vi.fn(async (_msg: string, choices: Array<{ value: string }>) => choices[0].value),
      promptText: vi.fn(async () => "manual-model"),
      promptConfirm: vi.fn(async () => false),
    }));
    vi.doMock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    const { launchAgent } = await import("../../src/agents/launch.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getDef("claude-code"), provider, "manual-model", { skipPermissions: false });
    vi.resetModules();
  });
});
