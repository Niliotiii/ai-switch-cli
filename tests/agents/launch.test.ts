import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDefinition, Provider } from "../../src/types.js";
import { listAgentDefinitions } from "../../src/agents/catalog.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const provider: Provider = {
  id: "1", name: "openrouter",
  anthropicBaseUrl: "https://anthropic.example.com",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const def = (id: string) => listAgentDefinitions().find((a) => a.id === id) as AgentDefinition;

beforeEach(() => { vi.resetAllMocks(); });

describe("agent launch", () => {
  it("buildAgentEnv: claude-code (env-inject/anthropic) mapeia para vars ANTHROPIC_*", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("claude-code"), provider)).toEqual({
      ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_BASE_URL: "https://anthropic.example.com",
    });
  });

  it("buildAgentEnv: codex (env-inject/openai) mapeia para vars OPENAI_*", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("codex"), provider)).toEqual({
      OPENAI_API_KEY: "sk-x", OPENAI_API_BASE: "https://openrouter.ai/api/v1", OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });
  });

  it("buildAgentEnv: agentes self-contained (opencode/copilot/antigravity) retornam {} mesmo com provedor", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    for (const id of ["opencode", "copilot", "antigravity"]) {
      expect(buildAgentEnv(def(id), provider)).toEqual({});
    }
  });

  it("buildAgentEnv: env-inject com provider null retorna {}", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("claude-code"), null)).toEqual({});
  });

  it("buildAgentEnv: claude-code dá throw quando anthropicBaseUrl é null (guard anti-corrupção-silenciosa)", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(() => buildAgentEnv(def("claude-code"), { ...provider, anthropicBaseUrl: null })).toThrow(/URL Anthropic/);
  });

  it("launchAgent faz spawn do claude com env ANTHROPIC mesclado e resolve com código de saída", async () => {
    const { spawn } = await import("node:child_process");
    const fakeChild = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
    const { launchAgent } = await import("../../src/agents/launch.js");
    const p = launchAgent(def("claude-code"), provider);
    expect(spawn).toHaveBeenCalledWith("claude", [], expect.objectContaining({
      stdio: "inherit",
      env: expect.objectContaining({ ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_BASE_URL: "https://anthropic.example.com" }),
    }));
    fakeChild.emit("exit", 0);
    await expect(p).resolves.toBe(0);
  });

  it("launchAgent faz spawn do opencode SEM chaves de env de provedor (self-contained)", async () => {
    // Isolate process.env so the assertion reflects what ai-switch injects, not the
    // ambient environment (which may carry ANTHROPIC_API_KEY from the host runtime).
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("opencode"), provider);
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("opencode");
      const env = (call[2] as { env: Record<string, string> }).env;
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });
});
