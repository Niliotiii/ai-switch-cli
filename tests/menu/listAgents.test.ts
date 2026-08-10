import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/agents/detect.js", () => ({
  detectAgents: vi.fn(() => [
    { definition: { id: "claude-code", label: "Claude Code", binary: "claude", versionArgs: ["--version"], authStrategy: "env-inject", envProtocol: "anthropic", homepage: "https://claude.ai/claude-code" }, installed: true },
    { definition: { id: "opencode", label: "opencode", binary: "opencode", versionArgs: ["--version"], authStrategy: "self-contained", envProtocol: null, homepage: "https://opencode.ai" }, installed: false },
  ]),
}));

describe("listAgentsFlow", () => {
  it("renderiza tabela com status instalado/não-instalado e a homepage para agentes faltantes", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });
    const { listAgentsFlow } = await import("../../src/menu/listAgents.js");
    listAgentsFlow();
    const out = logs.join("\n");
    expect(out).toMatch(/Ver Agents Disponíveis/);
    expect(out).toMatch(/Claude Code/);
    expect(out).toMatch(/instalado/);
    expect(out).toMatch(/opencode/);
    expect(out).toMatch(/não instalado/);
    expect(out).toMatch(/https:\/\/opencode\.ai/);
  });
});
