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
    contextFiles: ["CLAUDE.md"],
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
    contextFiles: ["AGENTS.md"],
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
    // opencode (verified v1.16.2) has NO skip-permissions flag for the default TUI mode this launch
    // targets — `--auto` never existed on the installed CLI and made yargs print --help and exit 1,
    // killing the launch before the TUI even started (confirmed by running `opencode -m x/y --auto`
    // directly). `--dangerously-skip-permissions` does exist, but only under the `opencode run`
    // one-shot subcommand, not the interactive `opencode [project]` default command ai-switch uses —
    // switching subcommands would change the whole UX, so left unset here instead of guessing another
    // flag. Revisit if/when opencode exposes an equivalent for the TUI entrypoint.
    // opencode compartilha o AGENTS.md com o codex — injectContext deduplica os destinos, então o
    // mesmo arquivo não é escrito duas vezes quando os dois agentes rodam no mesmo projeto.
    contextFiles: ["AGENTS.md"],
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
    // Só o caminho de custom instructions documentado pelo Copilot. O binário `copilot` não está
    // instalado nesta máquina para verificar se o CLI também lê AGENTS.md — e um arquivo a mais
    // escrito no repo do usuário por suposição é pior que contexto de menos. Se for verificado
    // depois, adicionar "AGENTS.md" aqui é uma linha (e o dedupe já cobre a sobreposição).
    contextFiles: [".github/copilot-instructions.md"],
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
