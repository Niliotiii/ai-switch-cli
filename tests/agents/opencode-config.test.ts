import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Provider } from "../../src/types.js";

let tmpDir: string;
const provider: Provider = { id: "1", name: "Openference", anthropicBaseUrl: null, openaiBaseUrl: "https://api.openference.com/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "opencode-cfg-"));
  process.env.AI_SWITCH_OPENCODE_CONFIG = path.join(tmpDir, "opencode", "opencode.json");
});
afterEach(() => {
  delete process.env.AI_SWITCH_OPENCODE_CONFIG;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("opencode-config", () => {
  it("buildOpencodeProviderEntry produces the ai-sdk/openai-compatible entry with the selected model", async () => {
    const { buildOpencodeProviderEntry } = await import("../../src/agents/opencode-config.js");
    expect(buildOpencodeProviderEntry(provider, "GLM-5.2")).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "ai-switch-Openference",
      options: { baseURL: "https://api.openference.com/v1", apiKey: "sk-x" },
      models: { "GLM-5.2": { name: "GLM-5.2" } },
    });
  });

  it("syncOpencodeProvider creates the file (with $schema) when it does not exist", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    syncOpencodeProvider(provider, "GLM-5.2");
    const cfg = JSON.parse(readFileSync(resolveOpencodeConfigPath(), "utf8"));
    expect(cfg.$schema).toBe("https://opencode.ai/config.json");
    expect(cfg.provider["ai-switch-Openference"].options.baseURL).toBe("https://api.openference.com/v1");
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.2"]).toEqual({ name: "GLM-5.2" });
  });

  it("syncOpencodeProvider preserves $schema and existing providers (idempotent merge)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    const cfgPath = resolveOpencodeConfigPath();
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      provider: { CrofAI: { npm: "@ai-sdk/openai-compatible", name: "CrofAI", options: { baseURL: "https://crof.ai/v1", apiKey: "crof-key" }, models: { "kimi": { name: "kimi" } } } }
    }, null, 2));
    syncOpencodeProvider(provider, "GLM-5.2");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    expect(cfg.provider.CrofAI.options.apiKey).toBe("crof-key"); // preserved
    expect(cfg.provider["ai-switch-Openference"].options.baseURL).toBe("https://api.openference.com/v1"); // added
    expect(Object.keys(cfg.provider).sort()).toEqual(["CrofAI", "ai-switch-Openference"]);
  });

  it("syncOpencodeProvider overwrites the ai-switch entry on re-run (idempotent by key, model updates)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    syncOpencodeProvider(provider, "GLM-5.2");
    syncOpencodeProvider(provider, "GLM-5.1");
    const cfg = JSON.parse(readFileSync(resolveOpencodeConfigPath(), "utf8"));
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.2"]).toBeUndefined();
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.1"]).toEqual({ name: "GLM-5.1" });
  });

  it("syncOpencodeProvider throws /URL OpenAI/ when openaiBaseUrl is null", async () => {
    const { syncOpencodeProvider } = await import("../../src/agents/opencode-config.js");
    expect(() => syncOpencodeProvider({ ...provider, openaiBaseUrl: null }, "x")).toThrow(/URL OpenAI/);
  });

  it("syncOpencodeProvider throws a readable error on invalid existing JSON (does not silently overwrite)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    const cfgPath = resolveOpencodeConfigPath();
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, "{ not valid json");
    expect(() => syncOpencodeProvider(provider, "GLM-5.2")).toThrow(/opencode.json/);
    // file untouched
    expect(readFileSync(cfgPath, "utf8")).toBe("{ not valid json");
  });
});
