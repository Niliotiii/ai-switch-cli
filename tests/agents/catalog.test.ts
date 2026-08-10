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
        expect(a.id).toBe("antigravity"); // the only self-contained agent
      } else {
        expect(a.envProtocol === "anthropic" || a.envProtocol === "openai").toBe(true);
      }
    }
  });

  it("claude-code/codex/opencode/copilot são env-inject; antigravity é self-contained", () => {
    const auth = (id: string) => getAgentDefinition(id as never).authStrategy;
    expect(auth("claude-code")).toBe("env-inject");
    expect(auth("codex")).toBe("env-inject");
    expect(auth("opencode")).toBe("env-inject");
    expect(auth("copilot")).toBe("env-inject");
    expect(auth("antigravity")).toBe("self-contained");
  });

  it("claude-code envProtocol é anthropic; codex envProtocol é openai", () => {
    expect(getAgentDefinition("claude-code").envProtocol).toBe("anthropic");
    expect(getAgentDefinition("codex").envProtocol).toBe("openai");
  });

  it("buildArgs produce the expected per-agent CLI args", () => {
    const p = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as import("../../src/types.js").Provider;
    expect(getAgentDefinition("claude-code").buildArgs(p, "claude-sonnet-5")).toEqual(["--model", "claude-sonnet-5"]);
    expect(getAgentDefinition("codex").buildArgs(p, "gpt-4o")).toEqual([]);
    expect(getAgentDefinition("opencode").buildArgs(p, "gpt-4o")).toEqual(["-m", "openai/gpt-4o"]); // TEMPORARY — Task 2 changes to ai-switch-openrouter/gpt-4o
    expect(getAgentDefinition("copilot").buildArgs(p, "gpt-4o")).toEqual([]);
    expect(getAgentDefinition("antigravity").buildArgs(p, "x")).toEqual([]);
  });

  it("codex is the only agent that does not require a model (requiresModel: false)", () => {
    for (const a of listAgentDefinitions()) {
      if (a.id === "codex") {
        expect(a.requiresModel).toBe(false);
      } else {
        expect(a.requiresModel ?? true).toBe(true);
      }
    }
  });

  it("copilot envBuilder emite COPILOT_PROVIDER_* com o modelo", () => {
    const provider = { id: "1", name: "p", anthropicBaseUrl: null, openaiBaseUrl: "https://api.example.com/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as const;
    expect(getAgentDefinition("copilot").envBuilder!(provider, "gpt-4o")).toEqual({
      COPILOT_PROVIDER_BASE_URL: "https://api.example.com/v1",
      COPILOT_PROVIDER_TYPE: "openai",
      COPILOT_PROVIDER_API_KEY: "sk-x",
      COPILOT_MODEL: "gpt-4o",
    });
  });

  it("copilot envBuilder dá throw quando openaiBaseUrl é null", () => {
    const provider = { id: "1", name: "p", anthropicBaseUrl: null, openaiBaseUrl: null, apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as const;
    expect(() => getAgentDefinition("copilot").envBuilder!(provider, "m")).toThrow(/URL OpenAI/);
  });

  it("getAgentDefinition dá throw em id desconhecido", () => {
    // @ts-expect-error testando guard de runtime
    expect(() => getAgentDefinition("unknown")).toThrow(/Unknown agent/);
  });
});

describe("agent definition fields", () => {
  it("every agent has a buildArgs function", () => {
    for (const a of listAgentDefinitions()) {
      expect(typeof a.buildArgs).toBe("function");
    }
  });

  it("only copilot has a custom envBuilder; the others rely on envProtocol fallback", () => {
    for (const a of listAgentDefinitions()) {
      if (a.id === "copilot") {
        expect(a.envBuilder).toBeDefined();
      } else {
        expect(a.envBuilder).toBeUndefined();
      }
    }
  });
});
