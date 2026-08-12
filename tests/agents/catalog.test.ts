import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/agents/opencode-config.js", () => ({
  syncOpencodeProvider: vi.fn(),
  opencodeProviderKey: (p: { name: string; id: string }) => `ai-switch-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || p.id}`,
}));

import { getAgentDefinition, listAgentDefinitions } from "../../src/agents/catalog.js";

describe("agent catalog", () => {
  it("listAgentDefinitions retorna exatamente os 4 agentes detectados", () => {
    const ids = listAgentDefinitions().map((a) => a.id).sort();
    expect(ids).toEqual(["claude-code", "codex", "copilot", "opencode"]);
  });

  it("todo agente tem binary, versionArgs [--version] e authStrategy/envProtocol consistentes", () => {
    for (const a of listAgentDefinitions()) {
      expect(a.binary).toBeTruthy();
      expect(a.versionArgs).toEqual(["--version"]);
      expect(a.homepage).toBeTruthy();
      expect(a.authStrategy).toBe("env-inject");
      expect(a.envProtocol === "anthropic" || a.envProtocol === "openai").toBe(true);
    }
  });

  it("todos os agentes são env-inject", () => {
    const auth = (id: string) => getAgentDefinition(id as never).authStrategy;
    expect(auth("claude-code")).toBe("env-inject");
    expect(auth("codex")).toBe("env-inject");
    expect(auth("opencode")).toBe("env-inject");
    expect(auth("copilot")).toBe("env-inject");
  });

  it("claude-code envProtocol é anthropic; codex envProtocol é openai", () => {
    expect(getAgentDefinition("claude-code").envProtocol).toBe("anthropic");
    expect(getAgentDefinition("codex").envProtocol).toBe("openai");
  });

  it("buildArgs produce the expected per-agent CLI args", () => {
    const p = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as import("../../src/types.js").Provider;
    expect(getAgentDefinition("claude-code").buildArgs(p, "claude-sonnet-5")).toEqual(["--model", "claude-sonnet-5"]);
    expect(getAgentDefinition("codex").buildArgs(p, "gpt-4o")).toEqual([]);
    expect(getAgentDefinition("opencode").buildArgs(p, "gpt-4o")).toEqual(["-m", "ai-switch-openrouter/gpt-4o"]);
    expect(getAgentDefinition("copilot").buildArgs(p, "gpt-4o")).toEqual([]);
  });

  it("opencode buildArgs normalizes the provider name (spaces/caps safe)", () => {
    const acme = { id: "1", name: "Acme AI", anthropicBaseUrl: null, openaiBaseUrl: "https://api.acme-ai.example/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as import("../../src/types.js").Provider;
    expect(getAgentDefinition("opencode").buildArgs(acme, "acme-pro")).toEqual(["-m", "ai-switch-acme-ai/acme-pro"]);
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

  it("only opencode has a prepareLaunch hook; the others rely on envBuilder/envProtocol fallback", () => {
    for (const a of listAgentDefinitions()) {
      if (a.id === "opencode") {
        expect(a.prepareLaunch).toBeDefined();
      } else {
        expect(a.prepareLaunch).toBeUndefined();
      }
    }
  });

  it("opencode prepareLaunch chama syncOpencodeProvider e dá throw em openaiBaseUrl null", async () => {
    const { syncOpencodeProvider } = await import("../../src/agents/opencode-config.js");
    const p = { id: "1", name: "openrouter", anthropicBaseUrl: null, openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as import("../../src/types.js").Provider;
    getAgentDefinition("opencode").prepareLaunch!(p, "gpt-4o");
    expect(syncOpencodeProvider).toHaveBeenCalledWith(p, "gpt-4o");
    const noOpenai = { ...p, openaiBaseUrl: null } as import("../../src/types.js").Provider;
    expect(() => getAgentDefinition("opencode").prepareLaunch!(noOpenai, "x")).toThrow(/URL OpenAI/);
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

describe("contextFiles (injeção de contexto entre provedores)", () => {
  it("cada agente declara o arquivo de instruções que lê nativamente", () => {
    expect(getAgentDefinition("claude-code").contextFiles).toEqual(["CLAUDE.md"]);
    expect(getAgentDefinition("codex").contextFiles).toEqual(["AGENTS.md"]);
    expect(getAgentDefinition("opencode").contextFiles).toEqual(["AGENTS.md"]);
    // Só o caminho documentado do Copilot. `copilot` não está instalado para verificar se o CLI
    // também lê AGENTS.md, e o plano proíbe adivinhar (mesma postura de skipPermissionsArgs).
    expect(getAgentDefinition("copilot").contextFiles).toEqual([".github/copilot-instructions.md"]);
  });

  it("todo agente tem contextFiles: array não-vazio de paths relativos", () => {
    for (const a of listAgentDefinitions()) {
      expect(Array.isArray(a.contextFiles), `${a.id} deve declarar contextFiles`).toBe(true);
      expect(a.contextFiles.length).toBeGreaterThan(0);
      for (const file of a.contextFiles) {
        expect(typeof file).toBe("string");
        // Relativo à raiz do projeto — nunca absoluto e nunca escapando para fora do repo.
        expect(file.startsWith("/")).toBe(false);
        expect(file.includes("..")).toBe(false);
      }
    }
  });
});

describe("skipPermissionsArgs (modo sem aprovação)", () => {
  it("claude-code usa --dangerously-skip-permissions", () => {
    expect(getAgentDefinition("claude-code").skipPermissionsArgs).toEqual(["--dangerously-skip-permissions"]);
  });

  it("codex usa --full-auto", () => {
    expect(getAgentDefinition("codex").skipPermissionsArgs).toEqual(["--full-auto"]);
  });

  it("opencode usa --auto", () => {
    expect(getAgentDefinition("opencode").skipPermissionsArgs).toEqual(["--auto"]);
  });

  it("copilot usa --yolo (alias de --allow-all, combina allow-all-tools + paths + urls)", () => {
    expect(getAgentDefinition("copilot").skipPermissionsArgs).toEqual(["--yolo"]);
  });

  it("todos os 4 agentes suportam skipPermissionsArgs", () => {
    for (const a of listAgentDefinitions()) {
      expect(a.skipPermissionsArgs, `${a.id} should support skip`).toBeDefined();
    }
  });

  it("todo agente com skipPermissionsArgs tem um array não-vazio de strings", () => {
    for (const a of listAgentDefinitions()) {
      if (a.skipPermissionsArgs) {
        expect(Array.isArray(a.skipPermissionsArgs)).toBe(true);
        expect(a.skipPermissionsArgs.length).toBeGreaterThan(0);
        for (const flag of a.skipPermissionsArgs) {
          expect(typeof flag).toBe("string");
          expect(flag.startsWith("--")).toBe(true);
        }
      }
    }
  });
});
