import { describe, expect, it, vi } from "vitest";
import { listAgentDefinitions } from "../../src/agents/catalog.js";

// The mock probe drives both detection stages. The first call is the PATH lookup
// (spawn("command", ["-v", binary])) — returning non-zero there forces the version
// probe (spawn(binary, versionArgs)) to run, so its result decides installed=true.
function probe(statusForVersion: number) {
  return vi.fn((bin: string) => ({
    status: bin === "command" ? 1 : statusForVersion,
  }));
}

describe("agent detection", () => {
  it("isAgentInstalled: PATH miss + version probe status 0 → true, chama probe com (binary, [--version])", async () => {
    const spawn = probe(0);
    const { isAgentInstalled } = await import("../../src/agents/detect.js");
    const claude = listAgentDefinitions().find((a) => a.id === "claude-code")!;
    expect(isAgentInstalled(claude, spawn as never)).toBe(true);
    expect(spawn).toHaveBeenCalledWith("claude", ["--version"], { stdio: "ignore" });
  });

  it("isAgentInstalled: PATH hit (command -v status 0) → true sem rodar o probe de versão", async () => {
    const spawn = vi.fn((bin: string) => ({ status: bin === "command" ? 0 : 1 }));
    const { isAgentInstalled } = await import("../../src/agents/detect.js");
    const claude = listAgentDefinitions().find((a) => a.id === "claude-code")!;
    expect(isAgentInstalled(claude, spawn as never)).toBe(true);
    // version probe must NOT have run — only the PATH lookup
    expect(spawn).not.toHaveBeenCalledWith("claude", ["--version"], { stdio: "ignore" });
  });

  it("isAgentInstalled retorna false em status não-zero ou null (após PATH miss)", async () => {
    const { isAgentInstalled } = await import("../../src/agents/detect.js");
    const claude = listAgentDefinitions().find((a) => a.id === "claude-code")!;
    expect(isAgentInstalled(claude, probe(127) as never)).toBe(false);
    expect(isAgentInstalled(claude, probe(null) as never)).toBe(false);
  });

  it("detectAgents retorna um status por agente com installed true apenas onde PATH/versão passa", async () => {
    // Every agent misses the PATH lookup (command → 1); opencode passes the version probe, others fail.
    const spawn = vi.fn((bin: string) => ({ status: bin === "opencode" ? 0 : 1 }));
    const { detectAgents } = await import("../../src/agents/detect.js");
    const statuses = detectAgents(listAgentDefinitions(), spawn as never);
    expect(statuses).toHaveLength(4);
    const installed = statuses.filter((s) => s.installed).map((s) => s.definition.id);
    expect(installed).toEqual(["opencode"]);
  });

  it("detectAgents usa todo o catálogo por default quando nenhum agente é passado", async () => {
    const spawn = vi.fn(() => ({ status: 1 }));
    const { detectAgents } = await import("../../src/agents/detect.js");
    expect(detectAgents(undefined, spawn as never)).toHaveLength(4);
  });
});
