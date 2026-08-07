import { mkdtempSync, rmSync } from "node:fs";
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

describe("provider persistence", () => {
  it("addProvider persists and is returned by listProviders", async () => {
    const { addProvider, listProviders } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x" });
    expect(created.id).toBeTruthy();
    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].name).toBe("openrouter");
  });

  it("addProvider strips trailing slashes from baseUrl", async () => {
    const { addProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", baseUrl: "https://api.example.com/v1/", apiKey: "sk-x" });
    expect(created.baseUrl).toBe("https://api.example.com/v1");
  });

  it("addProvider rejects duplicate names", async () => {
    const { addProvider } = await import("../../src/config/providers.js");
    addProvider({ name: "dup", baseUrl: "https://a.com", apiKey: "sk-a" });
    expect(() => addProvider({ name: "dup", baseUrl: "https://b.com", apiKey: "sk-b" })).toThrow(
      /already exists/
    );
  });

  it("getProviderByName finds an existing provider and returns undefined otherwise", async () => {
    const { addProvider, getProviderByName } = await import("../../src/config/providers.js");
    addProvider({ name: "findme", baseUrl: "https://a.com", apiKey: "sk-a" });
    expect(getProviderByName("findme")?.baseUrl).toBe("https://a.com");
    expect(getProviderByName("missing")).toBeUndefined();
  });
});
