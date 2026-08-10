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

export type AgentId = "claude-code" | "codex" | "opencode" | "copilot";
export type AuthStrategy = "env-inject" | "self-contained";
export type EnvBuilder = (provider: Provider, model: string) => Record<string, string>;
export type ArgsBuilder = (provider: Provider | null, model: string) => string[];
export type PrepareLaunch = (provider: Provider, model: string) => void | Promise<void>;
export interface AgentDefinition {
  id: AgentId;
  label: string;
  binary: string;
  versionArgs: string[];
  authStrategy: AuthStrategy;
  envProtocol: "anthropic" | "openai" | null; // null se, e somente se, authStrategy === "self-contained"
  homepage: string;
  envBuilder?: EnvBuilder; // custom env vars; when absent, buildAgentEnv falls back to anthropicEnv/openaiEnv by envProtocol
  buildArgs: ArgsBuilder; // CLI args; takes (provider, model) — most agents ignore provider; opencode uses it for the provider-name prefix
  requiresModel?: boolean; // false when the agent ignores a passed model (e.g. codex reads ~/.codex/config.toml); default true for env-inject agents
  prepareLaunch?: PrepareLaunch; // side-effect hook run before spawn (e.g. write opencode.json); env-inject agents that need a config file instead of env vars
}
export interface AgentStatus {
  definition: AgentDefinition;
  installed: boolean;
}

export interface LastSelection {
  agentId: AgentId;
  providerId: string;
  model: string;
}

export interface AppConfig {
  providers: Provider[];
  defaultProviderId?: string | null;
  lastSelection?: LastSelection | null;
}

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}
