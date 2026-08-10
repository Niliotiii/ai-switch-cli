import type { AgentDefinition, AgentId } from "../types.js";
import { copilotEnv } from "../tools/env.js";

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
    requiresModel: false, // codex reads its model from ~/.codex/config.toml; the menu must not prompt for one
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
    envBuilder: (provider, model) => copilotEnv(provider, model),
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
