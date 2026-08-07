import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/types.js";

vi.mock("../../src/tools/launcher.js", () => ({
  isBinaryInstalled: vi.fn(() => true),
}));

vi.mock("../../src/discovery/models.js", () => ({
  fetchModels: vi.fn(),
}));

const provider: Provider = {
  id: "1",
  name: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("doctor checks", () => {
  it("checkTools returns one result per registered tool, all ok when isBinaryInstalled is true", async () => {
    const { checkTools } = await import("../../src/doctor/checks.js");
    const results = checkTools();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("checkProvider returns ok with model count on success", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider(provider);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/2 modelo/);
  });

  it("checkProvider returns ok:false with the error message on failure", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HTTP 401"));
    const { checkProvider } = await import("../../src/doctor/checks.js");
    const result = await checkProvider(provider);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("HTTP 401");
  });

  it("runDoctor combines tool checks and provider checks", async () => {
    const { fetchModels } = await import("../../src/discovery/models.js");
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { runDoctor } = await import("../../src/doctor/checks.js");
    const results = await runDoctor([provider]);
    expect(results).toHaveLength(4);
  });
});
