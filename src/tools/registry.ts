import type { Provider, ToolDefinition, ToolId } from "../types.js";

function anthropicEnv(provider: Provider): Record<string, string> {
  if (!provider.anthropicBaseUrl) {
    throw new Error("Provedor não tem URL Anthropic configurada");
  }
  return { ANTHROPIC_API_KEY: provider.apiKey, ANTHROPIC_BASE_URL: provider.anthropicBaseUrl };
}

function openaiEnv(provider: Provider): Record<string, string> {
  if (!provider.openaiBaseUrl) {
    throw new Error("Provedor não tem URL OpenAI configurada");
  }
  return {
    OPENAI_API_KEY: provider.apiKey,
    OPENAI_API_BASE: provider.openaiBaseUrl,
    OPENAI_BASE_URL: provider.openaiBaseUrl,
  };
}

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    buildEnv: (provider) => anthropicEnv(provider),
    buildArgs: (_model, extraArgs) => [...extraArgs],
  },
  aider: {
    id: "aider",
    label: "Aider",
    binary: "aider",
    versionArgs: ["--version"],
    buildEnv: (provider) => openaiEnv(provider),
    buildArgs: (model, extraArgs) => ["--model", model, ...extraArgs],
  },
  "open-interpreter": {
    id: "open-interpreter",
    label: "Open Interpreter",
    binary: "interpreter",
    versionArgs: ["--version"],
    buildEnv: (provider) => openaiEnv(provider),
    buildArgs: (model, extraArgs) => ["--model", model, ...extraArgs],
  },
};

export function getProtocolBaseUrl(tool: ToolDefinition, provider: Provider): string | null {
  return tool.id === "claude-code" ? provider.anthropicBaseUrl : provider.openaiBaseUrl;
}

export function listTools(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

export function getTool(id: ToolId): ToolDefinition {
  const tool = TOOL_DEFINITIONS[id];
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
