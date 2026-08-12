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
vi.mock("../../src/context/store.js", () => ({
  getContextPackForProject: vi.fn(),
  createContextPack: vi.fn(),
  appendHandoff: vi.fn(),
}));
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(async () => "claude-code"),
  confirm: vi.fn(async () => false),
  input: vi.fn(async () => ""),
  password: vi.fn(async () => ""),
}));

const provider: Provider = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };

const disabledPack = {
  id: "ctx-1", name: "p", projectPath: "/repos/p", injectionEnabled: false,
  sections: { architecture: "", patterns: "", goal: "", decisions: [] }, handoffs: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
} as import("../../src/types.js").ContextPack;

beforeEach(async () => {
  vi.clearAllMocks();
  // lastSkipByAgent is module-scoped in startTool and would otherwise leak between cases.
  const { __resetSkipForTests, __resetContextPromptForTests } = await import("../../src/menu/startTool.js");
  __resetSkipForTests();
  __resetContextPromptForTests();
  // Default: a pack already exists but injection is disabled — the pre-existing tests exercise the
  // credential/model flow and shouldn't also trip the "no pack yet, want to create one?" offer or
  // the post-launch handoff prompt. Tests below override this per case.
  const { getContextPackForProject } = await import("../../src/context/store.js");
  (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(disabledPack);
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
    // Drives the fallback through the real ui/prompts.js (backed by the top-level @inquirer mocks)
    // instead of vi.doMock — doMock registrations aren't scoped to a single test and would otherwise
    // leak into every test that runs after this one in the file.
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("claude-code"), installed: true },
    ]);
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HTTP 401"));
    const { select, input } = await import("@inquirer/prompts");
    // Only two select() calls: agent, then provider — model selection falls through to the manual
    // promptText prompt because getModels rejects.
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("claude-code").mockResolvedValueOnce("1");
    (input as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("manual-model");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("claude-code"), provider, "manual-model", { skipPermissions: false });
  });
});

describe("startToolFlow — injeção de contexto e handoff", () => {
  const enabledPack = {
    id: "ctx-1", name: "p", projectPath: "/repos/p", injectionEnabled: true,
    sections: { architecture: "x", patterns: "", goal: "", decisions: [] }, handoffs: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as import("../../src/types.js").ContextPack;

  async function setupClaudeCodeHappyPath() {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: getAgentDefinition("claude-code"), installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("claude-code")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("claude-sonnet-5");
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    const { getModels } = await import("../../src/discovery/models.js");
    (getModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
  }

  it("pack habilitado: launchAgent recebe { context: pack } além de skipPermissions", async () => {
    await setupClaudeCodeHappyPath();
    const { getContextPackForProject } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(enabledPack);
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(getAgentDefinition("claude-code"), provider, "claude-sonnet-5", {
      skipPermissions: false,
      context: enabledPack,
    });
  });

  it("exit 0 + resumo digitado → appendHandoff com agente/provedor/modelo certos", async () => {
    await setupClaudeCodeHappyPath();
    const { getContextPackForProject, appendHandoff } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(enabledPack);
    const { input } = await import("@inquirer/prompts");
    // Único input() desta corrida é o resumo do handoff (getModels tem sucesso, então o fallback
    // manual de modelo — que também usa promptText/input — não é exercitado).
    (input as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("extraímos o catálogo declarativo");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(appendHandoff).toHaveBeenCalledWith("ctx-1", {
      agentId: "claude-code",
      providerName: "openrouter",
      model: "claude-sonnet-5",
      summary: "extraímos o catálogo declarativo",
    });
  });

  it("resumo vazio (Enter) → appendHandoff NÃO é chamado", async () => {
    await setupClaudeCodeHappyPath();
    const { getContextPackForProject, appendHandoff } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(enabledPack);
    // input() já resolve "" por default no mock de topo do arquivo — Enter puro.
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(appendHandoff).not.toHaveBeenCalled();
  });

  it("exit != 0 → não pergunta o resumo do handoff", async () => {
    await setupClaudeCodeHappyPath();
    const { getContextPackForProject, appendHandoff } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(enabledPack);
    const { launchAgent } = await import("../../src/agents/launch.js");
    (launchAgent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    const { input } = await import("@inquirer/prompts");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(appendHandoff).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
  });

  it("sem pack: oferece criar uma vez; recusando, não oferece de novo na chamada seguinte (mesma sessão de menu)", async () => {
    await setupClaudeCodeHappyPath();
    // A segunda corrida repete a mesma sequência de escolhas (agente/provedor/modelo).
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("claude-code")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("claude-sonnet-5");
    const { getContextPackForProject, createContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { confirm } = await import("@inquirer/prompts");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    await startToolFlow();
    expect(createContextPack).not.toHaveBeenCalled();
    // confirm() também é chamado por askSkipPermissions (claude-code suporta skip) em cada corrida —
    // isola a chamada da oferta de contexto pela mensagem em vez de um total bruto de chamadas.
    const offerCalls = (confirm as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([opts]) =>
      String((opts as { message?: string }).message).includes("contexto"),
    );
    expect(offerCalls).toHaveLength(1);
  });
});
