import { describe, expect, it } from "vitest";
import { getAgentDefinition, listAgentDefinitions } from "../../src/agents/catalog.js";

describe("agent catalog", () => {
  it("listAgentDefinitions retorna exatamente os 5 agentes detectados", () => {
    const ids = listAgentDefinitions().map((a) => a.id).sort();
    expect(ids).toEqual(["antigravity", "claude-code", "codex", "copilot", "opencode"]);
  });

  it("todo agente tem binary, versionArgs [--version] e authStrategy/envProtocol consistentes", () => {
    for (const a of listAgentDefinitions()) {
      expect(a.binary).toBeTruthy();
      expect(a.versionArgs).toEqual(["--version"]);
      expect(a.homepage).toBeTruthy();
      if (a.authStrategy === "self-contained") {
        expect(a.envProtocol).toBeNull();
      } else {
        expect(a.envProtocol === "anthropic" || a.envProtocol === "openai").toBe(true);
      }
    }
  });

  it("claude-code e codex são env-inject; opencode/copilot/antigravity são self-contained", () => {
    const auth = (id: string) => getAgentDefinition(id as never).authStrategy;
    expect(auth("claude-code")).toBe("env-inject");
    expect(auth("codex")).toBe("env-inject");
    expect(auth("opencode")).toBe("self-contained");
    expect(auth("copilot")).toBe("self-contained");
    expect(auth("antigravity")).toBe("self-contained");
  });

  it("claude-code envProtocol é anthropic; codex envProtocol é openai", () => {
    expect(getAgentDefinition("claude-code").envProtocol).toBe("anthropic");
    expect(getAgentDefinition("codex").envProtocol).toBe("openai");
  });

  it("getAgentDefinition dá throw em id desconhecido", () => {
    // @ts-expect-error testando guard de runtime
    expect(() => getAgentDefinition("unknown")).toThrow(/Unknown agent/);
  });
});