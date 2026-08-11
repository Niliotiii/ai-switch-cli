import { mkdtempSync, rmSync, existsSync, statSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ai-switch-test-"));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.AI_SWITCH_CONFIG_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("config store", () => {
  it("readConfig returns empty providers when no file exists", async () => {
    const { readConfig } = await import("../../src/config/store.js");
    expect(readConfig()).toEqual({ providers: [] });
  });

  it("writeConfig persists data readable by readConfig, with 0600 perms", async () => {
    const { readConfig, writeConfig } = await import("../../src/config/store.js");
    const { getConfigFile } = await import("../../src/config/paths.js");
    writeConfig({
      providers: [
        { id: "1", name: "openrouter", anthropicBaseUrl: "https://openrouter.ai/api/v1", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(readConfig().providers).toHaveLength(1);
    const file = getConfigFile();
    expect(existsSync(file)).toBe(true);
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf-8")).providers[0].name).toBe("openrouter");
  });

  it("readConfig returns empty providers when config file is corrupted (invalid JSON)", async () => {
    const { readConfig } = await import("../../src/config/store.js");
    const { getConfigFile } = await import("../../src/config/paths.js");
    const file = getConfigFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{ not valid json ,,, ", "utf-8");
    expect(() => readConfig()).not.toThrow();
    expect(readConfig()).toEqual({ providers: [] });
  });

  it("readConfig migrates a legacy provider with baseUrl into both protocol URLs", async () => {
    const { writeConfig, readConfig } = await import("../../src/config/store.js");
    const { getConfigFile } = await import("../../src/config/paths.js");
    const fs = await import("node:fs");
    const legacy = {
      providers: [
        { id: "1", name: "old", baseUrl: "https://api.example.com/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    fs.writeFileSync(getConfigFile(), JSON.stringify(legacy), { mode: 0o600 });

    const providers = readConfig().providers;
    expect(providers[0].anthropicBaseUrl).toBe("https://api.example.com/v1");
    expect(providers[0].openaiBaseUrl).toBe("https://api.example.com/v1");
  });
});

describe("last selection", () => {
  it("getLastSelection / setLastSelection round-trip the last launched combination", async () => {
    const { writeConfig, getLastSelection, setLastSelection, readConfig } = await import("../../src/config/store.js");
    writeConfig({ providers: [] });
    expect(getLastSelection()).toBe(null);
    setLastSelection({ agentId: "claude-code", providerId: "p1", model: "claude-sonnet-5" });
    expect(getLastSelection()).toEqual({ agentId: "claude-code", providerId: "p1", model: "claude-sonnet-5" });
    expect(readConfig().lastSelection).toEqual({ agentId: "claude-code", providerId: "p1", model: "claude-sonnet-5" });
  });
});
