import { describe, expect, it } from "vitest";
import { getProtocolBaseUrl, getTool, listTools } from "../../src/tools/registry.js";

const provider = {
  id: "1",
  name: "openrouter",
  anthropicBaseUrl: "https://anthropic.example.com",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-x",
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies import("../../src/types.js").Provider;

describe("tools registry", () => {
  it("listTools returns claude-code, aider and open-interpreter", () => {
    const ids = listTools().map((t) => t.id).sort();
    expect(ids).toEqual(["aider", "claude-code", "open-interpreter"]);
  });

  it("claude-code buildEnv maps to ANTHROPIC_* vars from anthropicBaseUrl", () => {
    const tool = getTool("claude-code");
    expect(tool.buildEnv(provider, "claude-sonnet-5")).toEqual({
      ANTHROPIC_API_KEY: "sk-x",
      ANTHROPIC_BASE_URL: "https://anthropic.example.com",
    });
  });

  it("aider buildEnv maps to OPENAI_* vars from openaiBaseUrl and buildArgs includes --model", () => {
    const tool = getTool("aider");
    expect(tool.buildEnv(provider, "gpt-4o")).toEqual({
      OPENAI_API_KEY: "sk-x",
      OPENAI_API_BASE: "https://openrouter.ai/api/v1",
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
    });
    expect(tool.buildArgs("gpt-4o", ["--yes"])).toEqual(["--model", "gpt-4o", "--yes"]);
  });

  it("buildEnv throws when the tool's protocol URL is null", () => {
    const tool = getTool("claude-code");
    const noAnthropic = { ...provider, anthropicBaseUrl: null };
    expect(() => tool.buildEnv(noAnthropic, "x")).toThrow(/URL Anthropic/);
  });

  it("open-interpreter buildEnv throws when openaiBaseUrl is null", () => {
    const tool = getTool("open-interpreter");
    const noOpenai = { ...provider, openaiBaseUrl: null };
    expect(() => tool.buildEnv(noOpenai, "x")).toThrow(/URL OpenAI/);
  });

  it("getProtocolBaseUrl returns the matching protocol URL", () => {
    expect(getProtocolBaseUrl(getTool("claude-code"), provider)).toBe("https://anthropic.example.com");
    expect(getProtocolBaseUrl(getTool("aider"), provider)).toBe("https://openrouter.ai/api/v1");
    expect(getProtocolBaseUrl(getTool("open-interpreter"), provider)).toBe("https://openrouter.ai/api/v1");
  });

  it("getProtocolBaseUrl returns null when the protocol URL is missing", () => {
    const noOpenai = { ...provider, openaiBaseUrl: null };
    expect(getProtocolBaseUrl(getTool("aider"), noOpenai)).toBeNull();
    const noAnthropic = { ...provider, anthropicBaseUrl: null };
    expect(getProtocolBaseUrl(getTool("claude-code"), noAnthropic)).toBeNull();
  });

  it("getTool throws on unknown id", () => {
    // @ts-expect-error testing runtime guard
    expect(() => getTool("unknown")).toThrow(/Unknown tool/);
  });
});
