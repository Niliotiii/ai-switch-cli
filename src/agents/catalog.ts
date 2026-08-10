import type { AgentDefinition, AgentId } from "../types.js";

export const AGENT_CATALOG: Record<AgentId, AgentDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "anthropic",
    homepage: "https://claude.ai/claude-code",
    buildArgs: (model) => ["--model", model],
  },
  codex: {
    id: "codex",
    label: "OpenAI Codex",
    binary: "codex",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "openai",
    homepage: "https://github.com/openai/codex",
    buildArgs: () => [], // model comes from ~/.codex/config.toml
  },
  opencode: {
    id: "opencode",
    label: "opencode",
    binary: "opencode",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "openai",
    homepage: "https://opencode.ai",
    buildArgs: (model) => ["-m", `openai/${model}`], // opencode -m expects provider/model; provider is the opencode-internal "openai"
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot CLI",
    binary: "copilot",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "openai",
    homepage: "https://github.com/github/copilot-cli",
    // NOTE: inline closure — Task 4 refactors this to delegate to the exported copilotEnv
    // in src/tools/env.ts (behavior-identical, throw-on-null preserved).
    envBuilder: (provider, model) => {
      if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
      return {
        COPILOT_PROVIDER_BASE_URL: provider.openaiBaseUrl,
        COPILOT_PROVIDER_TYPE: "openai",
        COPILOT_PROVIDER_API_KEY: provider.apiKey,
        COPILOT_MODEL: model,
      };
    },
    buildArgs: () => [],
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    binary: "antigravity",
    versionArgs: ["--version"],
    authStrategy: "self-contained",
    envProtocol: null,
    homepage: "https://antigravity.google",
    buildArgs: () => [],
  },
};

export function listAgentDefinitions(): AgentDefinition[] {
  return Object.values(AGENT_CATALOG);
}

export function getAgentDefinition(id: AgentId): AgentDefinition {
  const d = AGENT_CATALOG[id];
  if (!d) throw new Error(`Unknown agent: ${id}`);
  return d;
}
