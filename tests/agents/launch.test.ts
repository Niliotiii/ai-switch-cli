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
    expect(buildAgentEnv(def("claude-code"), provider, "claude-sonnet-5")).toEqual({
      ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_BASE_URL: "https://anthropic.example.com",
    });
  });

  it("buildAgentEnv: codex (env-inject/openai) mapeia para vars OPENAI_*", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("codex"), provider, "gpt-4o")).toEqual({
      OPENAI_API_KEY: "sk-x", OPENAI_API_BASE: "https://openrouter.ai/api/v1", OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });
  });

  it("buildAgentEnv: agentes self-contained (antigravity) retornam {} mesmo com provedor", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    for (const id of ["antigravity"]) {
      expect(buildAgentEnv(def(id), provider, "x")).toEqual({});
    }
  });

  it("buildAgentEnv: env-inject com provider null retorna {}", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("claude-code"), null, "x")).toEqual({});
  });

  it("buildAgentEnv: claude-code dá throw quando anthropicBaseUrl é null (guard anti-corrupção-silenciosa)", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(() => buildAgentEnv(def("claude-code"), { ...provider, anthropicBaseUrl: null }, "x")).toThrow(/URL Anthropic/);
  });

  it("launchAgent faz spawn do claude com env ANTHROPIC mesclado e --model, resolve com código de saída", async () => {
    const { spawn } = await import("node:child_process");
    const fakeChild = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
    const { launchAgent } = await import("../../src/agents/launch.js");
    const p = launchAgent(def("claude-code"), provider, "claude-sonnet-5");
    expect(spawn).toHaveBeenCalledWith("claude", ["--model", "claude-sonnet-5"], expect.objectContaining({
      stdio: "inherit",
      env: expect.objectContaining({ ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_BASE_URL: "https://anthropic.example.com" }),
    }));
    fakeChild.emit("exit", 0);
    await expect(p).resolves.toBe(0);
  });

  it("launchAgent faz spawn do opencode com OPENAI env e -m openai/<model>", async () => {
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("opencode"), provider, "gpt-4o");
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("opencode");
      expect(call[1]).toEqual(["-m", "openai/gpt-4o"]);
      const env = (call[2] as { env: Record<string, string> }).env;
      expect(env.OPENAI_API_KEY).toBe("sk-x");
      expect(env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });

  it("launchAgent faz spawn do copilot com COPILOT_PROVIDER_* env e sem args (model vai em COPILOT_MODEL)", async () => {
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("copilot"), provider, "gpt-4o");
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("copilot");
      expect(call[1]).toEqual([]);
      const env = (call[2] as { env: Record<string, string> }).env;
      expect(env.COPILOT_PROVIDER_BASE_URL).toBe("https://openrouter.ai/api/v1");
      expect(env.COPILOT_PROVIDER_API_KEY).toBe("sk-x");
      expect(env.COPILOT_MODEL).toBe("gpt-4o");
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });
});
