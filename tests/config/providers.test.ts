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

  it("updateProvider updates name, baseUrl, apiKey and returns the updated provider", async () => {
    const { addProvider, listProviders, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", baseUrl: "https://a.com/v1/", apiKey: "old-key" });
    const updated = updateProvider(created.id, { name: "p1-renamed", baseUrl: "https://a.com/v2", apiKey: "new-key" });
    expect(updated.name).toBe("p1-renamed");
    expect(updated.baseUrl).toBe("https://a.com/v2");
    expect(updated.apiKey).toBe("new-key");
    expect(listProviders()[0]).toEqual(updated);
  });

  it("updateProvider strips trailing slashes from baseUrl when changed", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", baseUrl: "https://a.com/v1", apiKey: "sk-x" });
    const updated = updateProvider(created.id, { baseUrl: "https://a.com/v2/" });
    expect(updated.baseUrl).toBe("https://a.com/v2");
  });

  it("updateProvider leaves unspecified fields unchanged", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", baseUrl: "https://a.com/v1", apiKey: "sk-orig" });
    const updated = updateProvider(created.id, { name: "p1-new" });
    expect(updated.name).toBe("p1-new");
    expect(updated.baseUrl).toBe("https://a.com/v1");
    expect(updated.apiKey).toBe("sk-orig");
  });

  it("updateProvider rejects when new name collides with another provider", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", baseUrl: "https://a.com", apiKey: "sk-a" });
    addProvider({ name: "beta", baseUrl: "https://b.com", apiKey: "sk-b" });
    expect(() => updateProvider(a.id, { name: "beta" })).toThrow(/already exists/);
  });

  it("updateProvider allows keeping the same name (no self-collision)", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", baseUrl: "https://a.com", apiKey: "sk-a" });
    const updated = updateProvider(a.id, { name: "Alpha" });
    expect(updated.name).toBe("Alpha");
  });

  it("updateProvider throws when no provider with that id exists", async () => {
    const { updateProvider } = await import("../../src/config/providers.js");
    expect(() => updateProvider("nonexistent-id", { name: "x" })).toThrow(/not found/);
  });
});
