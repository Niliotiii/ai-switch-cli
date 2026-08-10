import type { AgentDefinition, AgentId } from "../types.js";

export const AGENT_CATALOG: Record<AgentId, AgentDefinition> = {
  "claude-code": { id: "claude-code", label: "Claude Code", binary: "claude", versionArgs: ["--version"], authStrategy: "env-inject", envProtocol: "anthropic", homepage: "https://claude.ai/claude-code" },
  codex: { id: "codex", label: "OpenAI Codex", binary: "codex", versionArgs: ["--version"], authStrategy: "env-inject", envProtocol: "openai", homepage: "https://github.com/openai/codex" },
  opencode: { id: "opencode", label: "opencode", binary: "opencode", versionArgs: ["--version"], authStrategy: "self-contained", envProtocol: null, homepage: "https://opencode.ai" },
  copilot: { id: "copilot", label: "GitHub Copilot CLI", binary: "copilot", versionArgs: ["--version"], authStrategy: "self-contained", envProtocol: null, homepage: "https://github.com/github/copilot-cli" },
  antigravity: { id: "antigravity", label: "Antigravity", binary: "antigravity", versionArgs: ["--version"], authStrategy: "self-contained", envProtocol: null, homepage: "https://antigravity.google" },
};

export function listAgentDefinitions(): AgentDefinition[] {
  return Object.values(AGENT_CATALOG);
}

export function getAgentDefinition(id: AgentId): AgentDefinition {
  const d = AGENT_CATALOG[id];
  if (!d) throw new Error(`Unknown agent: ${id}`);
  return d;
}