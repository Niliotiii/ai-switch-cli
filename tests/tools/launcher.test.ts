import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider, ToolDefinition } from "../../src/types.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

const provider: Provider = {
  id: "1",
  name: "test",
  baseUrl: "https://api.example.com",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const tool: ToolDefinition = {
  id: "claude-code",
  label: "Claude Code",
  binary: "claude",
  versionArgs: ["--version"],
  buildEnv: (p) => ({ ANTHROPIC_API_KEY: p.apiKey, ANTHROPIC_BASE_URL: p.baseUrl }),
  buildArgs: (_model, extra) => [...extra],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("launcher", () => {
  it("isBinaryInstalled returns true when spawnSync exits 0", async () => {
    const { spawnSync } = await import("node:child_process");
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    const { isBinaryInstalled } = await import("../../src/tools/launcher.js");
    expect(isBinaryInstalled(tool)).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith("claude", ["--version"], { stdio: "ignore" });
  });

  it("isBinaryInstalled returns false when spawnSync exits non-zero", async () => {
    const { spawnSync } = await import("node:child_process");
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ status: 127 });
    const { isBinaryInstalled } = await import("../../src/tools/launcher.js");
    expect(isBinaryInstalled(tool)).toBe(false);
  });

  it("launchTool spawns the binary with merged env and resolves with exit code", async () => {
    const { spawn } = await import("node:child_process");
    const fakeChild = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);

    const { launchTool } = await import("../../src/tools/launcher.js");
    const resultPromise = launchTool(tool, provider, "claude-sonnet-5", []);

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      [],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          ANTHROPIC_API_KEY: "sk-x",
          ANTHROPIC_BASE_URL: "https://api.example.com",
        }),
      })
    );

    fakeChild.emit("exit", 0);
    await expect(resultPromise).resolves.toBe(0);
  });
});
