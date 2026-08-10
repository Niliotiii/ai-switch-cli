export interface Provider {
  id: string;
  name: string;
  anthropicBaseUrl: string | null;
  openaiBaseUrl: string | null;
  apiKey: string;
  createdAt: string;
}

export interface Model {
  id: string;
}

export type AgentId = "claude-code" | "codex" | "opencode" | "copilot" | "antigravity";
export type AuthStrategy = "env-inject" | "self-contained";
export type EnvBuilder = (provider: Provider, model: string) => Record<string, string>;
export type ArgsBuilder = (model: string) => string[];
export interface AgentDefinition {
  id: AgentId;
  label: string;
  binary: string;
  versionArgs: string[];
  authStrategy: AuthStrategy;
  envProtocol: "anthropic" | "openai" | null; // null se, e somente se, authStrategy === "self-contained"
  homepage: string;
  envBuilder?: EnvBuilder; // custom env vars; when absent, buildAgentEnv falls back to anthropicEnv/openaiEnv by envProtocol
  buildArgs: ArgsBuilder; // CLI args for the model; env-inject agents use it; self-contained return []
  requiresModel?: boolean; // false when the agent ignores a passed model (e.g. codex reads ~/.codex/config.toml); default true for env-inject agents
}
export interface AgentStatus {
  definition: AgentDefinition;
  installed: boolean;
}

export interface AppConfig {
  providers: Provider[];
}

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}
