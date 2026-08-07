import type { Provider, ToolDefinition, ToolId } from "../types.js";

function buildOpenAIEnv(provider: Provider): Record<string, string> {
  return {
    OPENAI_API_KEY: provider.apiKey,
    OPENAI_API_BASE: provider.baseUrl,
    OPENAI_BASE_URL: provider.baseUrl,
  };
}

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    buildEnv: (provider: Provider) => ({
      ANTHROPIC_API_KEY: provider.apiKey,
      ANTHROPIC_BASE_URL: provider.baseUrl,
    }),
    buildArgs: (_model: string, extraArgs: string[]) => [...extraArgs],
  },
  aider: {
    id: "aider",
    label: "Aider",
    binary: "aider",
    versionArgs: ["--version"],
    buildEnv: buildOpenAIEnv,
    buildArgs: (model: string, extraArgs: string[]) => ["--model", model, ...extraArgs],
  },
  "open-interpreter": {
    id: "open-interpreter",
    label: "Open Interpreter",
    binary: "interpreter",
    versionArgs: ["--version"],
    buildEnv: buildOpenAIEnv,
    buildArgs: (model: string, extraArgs: string[]) => ["--model", model, ...extraArgs],
  },
};

export function listTools(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

export function getTool(id: ToolId): ToolDefinition {
  const tool = TOOL_DEFINITIONS[id];
  if (!tool) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return tool;
}
