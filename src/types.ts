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
export interface AgentDefinition {
  id: AgentId;
  label: string;
  binary: string;
  versionArgs: string[];
  authStrategy: AuthStrategy;
  envProtocol: "anthropic" | "openai" | null; // null se, e somente se, authStrategy === "self-contained"
  homepage: string;
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
