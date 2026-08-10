import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

vi.mock("../../src/agents/detect.js", () => ({
  detectAgents: vi.fn(() => []),
  isAgentInstalled: vi.fn(() => true),
}));
vi.mock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
vi.mock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [] as Provider[]) }));
vi.mock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn() }));
vi.mock("@inquirer/prompts", () => ({ select: vi.fn(async () => "claude-code") }));

const claudeDef = { id: "claude-code", label: "Claude Code", binary: "claude", versionArgs: ["--version"], authStrategy: "env-inject" as const, envProtocol: "anthropic" as const, homepage: "https://claude.ai/claude-code" };
const opencodeDef = { id: "opencode", label: "opencode", binary: "opencode", versionArgs: ["--version"], authStrategy: "self-contained" as const, envProtocol: null, homepage: "https://opencode.ai" };

beforeEach(() => { vi.clearAllMocks(); });

describe("startToolFlow", () => {
  it("imprime mensagem clara e retorna quando nenhum agente está instalado", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(logs.join("\n")).toMatch(/Nenhum agente detectado/);
  });

  it("agente self-contained (opencode) é lançado com provider null, sem prompt de provedor", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: opencodeDef, installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("opencode");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { listProviders } = await import("../../src/config/providers.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(listProviders).not.toHaveBeenCalled();
    expect(launchAgent).toHaveBeenCalledWith(opencodeDef, null);
  });

  it("agente env-inject (claude-code) pede um provedor e é lançado com ele", async () => {
    const provider: Provider = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: claudeDef, installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    // The env-inject flow calls select twice: first the agent, then the provider.
    (select as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("claude-code")
      .mockResolvedValueOnce("openrouter");
    const { listProviders } = await import("../../src/config/providers.js");
    (listProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue([provider]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(claudeDef, provider);
  });
});
