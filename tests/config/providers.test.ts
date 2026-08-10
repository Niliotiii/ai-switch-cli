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
    const created = addProvider({ name: "openrouter", anthropicBaseUrl: null, openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x" });
    expect(created.id).toBeTruthy();
    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].openaiBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(listProviders()[0].anthropicBaseUrl).toBeNull();
  });

  it("addProvider strips trailing slashes from configured URLs", async () => {
    const { addProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", anthropicBaseUrl: "https://api.example.com/v1/", openaiBaseUrl: "https://api.example.com/v1/", apiKey: "sk-x" });
    expect(created.anthropicBaseUrl).toBe("https://api.example.com/v1");
    expect(created.openaiBaseUrl).toBe("https://api.example.com/v1");
  });

  it("addProvider rejects when both URLs are null", async () => {
    const { addProvider } = await import("../../src/config/providers.js");
    expect(() => addProvider({ name: "p1", anthropicBaseUrl: null, openaiBaseUrl: null, apiKey: "sk-x" })).toThrow(/pelo menos uma URL/);
  });

  it("addProvider rejects duplicate names", async () => {
    const { addProvider } = await import("../../src/config/providers.js");
    addProvider({ name: "dup", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-a" });
    expect(() => addProvider({ name: "dup", anthropicBaseUrl: "https://b.com", openaiBaseUrl: null, apiKey: "sk-b" })).toThrow(
      /already exists/
    );
  });

  it("getProviderByName finds an existing provider and returns undefined otherwise", async () => {
    const { addProvider, getProviderByName } = await import("../../src/config/providers.js");
    addProvider({ name: "findme", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-a" });
    expect(getProviderByName("findme")?.anthropicBaseUrl).toBe("https://a.com");
    expect(getProviderByName("missing")).toBeUndefined();
  });

  it("updateProvider updates name, URLs, apiKey and returns the updated provider", async () => {
    const { addProvider, listProviders, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", anthropicBaseUrl: "https://a.com/v1/", openaiBaseUrl: null, apiKey: "old-key" });
    const updated = updateProvider(created.id, { name: "p1-renamed", anthropicBaseUrl: "https://a.com/v2", openaiBaseUrl: "https://a.com/v3", apiKey: "new-key" });
    expect(updated.name).toBe("p1-renamed");
    expect(updated.anthropicBaseUrl).toBe("https://a.com/v2");
    expect(updated.openaiBaseUrl).toBe("https://a.com/v3");
    expect(updated.apiKey).toBe("new-key");
    expect(listProviders()[0]).toEqual(updated);
  });

  it("updateProvider strips trailing slashes from URLs when changed", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", anthropicBaseUrl: "https://a.com/v1", openaiBaseUrl: null, apiKey: "sk-x" });
    const updated = updateProvider(created.id, { anthropicBaseUrl: "https://a.com/v2/", openaiBaseUrl: "https://a.com/v3/" });
    expect(updated.anthropicBaseUrl).toBe("https://a.com/v2");
    expect(updated.openaiBaseUrl).toBe("https://a.com/v3");
  });

  it("updateProvider leaves unspecified fields unchanged", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", anthropicBaseUrl: "https://a.com/v1", openaiBaseUrl: null, apiKey: "sk-orig" });
    const updated = updateProvider(created.id, { name: "p1-new" });
    expect(updated.name).toBe("p1-new");
    expect(updated.anthropicBaseUrl).toBe("https://a.com/v1");
    expect(updated.openaiBaseUrl).toBeNull();
    expect(updated.apiKey).toBe("sk-orig");
  });

  it("updateProvider rejects when new name collides with another provider", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-a" });
    addProvider({ name: "beta", anthropicBaseUrl: "https://b.com", openaiBaseUrl: null, apiKey: "sk-b" });
    expect(() => updateProvider(a.id, { name: "beta" })).toThrow(/already exists/);
  });

  it("updateProvider allows keeping the same name (no self-collision)", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-a" });
    const updated = updateProvider(a.id, { name: "Alpha" });
    expect(updated.name).toBe("Alpha");
  });

  it("updateProvider throws when no provider with that id exists", async () => {
    const { updateProvider } = await import("../../src/config/providers.js");
    expect(() => updateProvider("nonexistent-id", { name: "x" })).toThrow(/not found/);
  });

  it("updateProvider rejects when changes would leave both URLs null", async () => {
    const { addProvider, updateProvider } = await import("../../src/config/providers.js");
    const created = addProvider({ name: "p1", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-x" });
    expect(() => updateProvider(created.id, { anthropicBaseUrl: null })).toThrow(/pelo menos uma URL/);
  });

  it("deleteProvider removes the provider and returns it", async () => {
    const { addProvider, deleteProvider, listProviders } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", anthropicBaseUrl: "https://a.com", openaiBaseUrl: null, apiKey: "sk-a" });
    addProvider({ name: "beta", anthropicBaseUrl: "https://b.com", openaiBaseUrl: null, apiKey: "sk-b" });
    const removed = deleteProvider(a.id);
    expect(removed.name).toBe("alpha");
    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].name).toBe("beta");
  });

  it("deleteProvider does not affect other providers' order or fields", async () => {
    const { addProvider, deleteProvider, listProviders } = await import("../../src/config/providers.js");
    const a = addProvider({ name: "alpha", anthropicBaseUrl: "https://a.com/v1", openaiBaseUrl: null, apiKey: "sk-a" });
    addProvider({ name: "beta", anthropicBaseUrl: "https://b.com/v1", openaiBaseUrl: null, apiKey: "sk-b" });
    deleteProvider(a.id);
    const remaining = listProviders();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ name: "beta", anthropicBaseUrl: "https://b.com/v1", openaiBaseUrl: null, apiKey: "sk-b" });
  });

  it("deleteProvider throws when no provider with that id exists", async () => {
    const { deleteProvider } = await import("../../src/config/providers.js");
    expect(() => deleteProvider("nonexistent-id")).toThrow(/not found/);
  });
});
