import { describe, expect, it } from "vitest";
import { getTool, listTools } from "../../src/tools/registry.js";
import type { Provider } from "../../src/types.js";

const provider: Provider = {
  id: "1",
  name: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("tools registry", () => {
  it("listTools returns claude-code, aider and open-interpreter", () => {
    const ids = listTools().map((t) => t.id).sort();
    expect(ids).toEqual(["aider", "claude-code", "open-interpreter"]);
  });

  it("claude-code buildEnv maps to ANTHROPIC_* vars", () => {
    const tool = getTool("claude-code");
    expect(tool.buildEnv(provider, "claude-sonnet-5")).toEqual({
      ANTHROPIC_API_KEY: "sk-x",
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api/v1",
    });
  });

  it("aider buildEnv maps to OPENAI_* vars and buildArgs includes --model", () => {
    const tool = getTool("aider");
    expect(tool.buildEnv(provider, "gpt-4o")).toEqual({
      OPENAI_API_KEY: "sk-x",
      OPENAI_API_BASE: "https://openrouter.ai/api/v1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });
    expect(tool.buildArgs("gpt-4o", ["--yes"])).toEqual(["--model", "gpt-4o", "--yes"]);
  });

  it("getTool throws on unknown id", () => {
    // @ts-expect-error testing runtime guard
    expect(() => getTool("unknown")).toThrow(/Unknown tool/);
  });
});
