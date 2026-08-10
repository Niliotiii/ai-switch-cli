import { describe, expect, it, vi } from "vitest";
import { listAgentDefinitions } from "../../src/agents/catalog.js";

describe("agent detection", () => {
  it("isAgentInstalled retorna true quando spawn sai 0 e chama spawn com (binary, [--version], {stdio:ignore})", async () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const { isAgentInstalled } = await import("../../src/agents/detect.js");
    const claude = listAgentDefinitions().find((a) => a.id === "claude-code")!;
    expect(isAgentInstalled(claude, spawn as never)).toBe(true);
    expect(spawn).toHaveBeenCalledWith("claude", ["--version"], { stdio: "ignore" });
  });

  it("isAgentInstalled retorna false em status não-zero ou null", async () => {
    const { isAgentInstalled } = await import("../../src/agents/detect.js");
    const claude = listAgentDefinitions().find((a) => a.id === "claude-code")!;
    expect(isAgentInstalled(claude, vi.fn(() => ({ status: 127 })) as never)).toBe(false);
    expect(isAgentInstalled(claude, vi.fn(() => ({ status: null })) as never)).toBe(false);
  });

  it("detectAgents retorna um status por agente com installed true apenas onde spawn sai 0", async () => {
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
