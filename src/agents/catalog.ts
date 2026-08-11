import type { AgentDefinition, AgentId } from "../types.js";
import { copilotEnv } from "../tools/env.js";
import { opencodeProviderKey, syncOpencodeProvider } from "./opencode-config.js";

export const AGENT_CATALOG: Record<AgentId, AgentDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "anthropic",
    homepage: "https://claude.ai/claude-code",
    buildArgs: (_provider, model) => ["--model", model],
    skipPermissionsArgs: ["--dangerously-skip-permissions"],
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
    // --full-auto is the openai/codex "yolo" mode (allow-all-tools + allow-all-paths + allow-all-urls,
    // sandboxed network access). Aliased as --yolo by codex itself.
    skipPermissionsArgs: ["--full-auto"],
  },
  opencode: {
    id: "opencode",
    label: "opencode",
    binary: "opencode",
    versionArgs: ["--version"],
    authStrategy: "env-inject",
    envProtocol: "openai",
    homepage: "https://opencode.ai",
    // opencode ignores OPENAI_BASE_URL (built-in OpenAI provider is hardcoded to api.openai.com).
    // Instead of env injection, write a custom ai-switch-<name> provider into ~/.config/opencode/opencode.json
    // (npm: @ai-sdk/openai-compatible) and launch with -m ai-switch-<name>/<model>.
    prepareLaunch: (provider, model) => {
      if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
      syncOpencodeProvider(provider, model);
    },
    buildArgs: (provider, model) => {
      if (!provider) throw new Error("opencode requer um provedor (buildArgs)");
      return ["-m", `${opencodeProviderKey(provider)}/${model}`];
    },
    // --auto is opencode's skip-permissions flag (the alternative is "*": "allow" in opencode.json).
    skipPermissionsArgs: ["--auto"],
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
    // --yolo is the short alias of --allow-all (allow-all-tools + allow-all-paths + allow-all-urls).
    // In an interactive session the same can be toggled with Shift+Tab or the /yolo slash command.
    skipPermissionsArgs: ["--yolo"],
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
