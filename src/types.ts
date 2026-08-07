export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

export interface Model {
  id: string;
}

export type ToolId = "claude-code" | "aider" | "open-interpreter";

export interface ToolDefinition {
  id: ToolId;
  label: string;
  binary: string;
  versionArgs: string[];
  buildEnv: (provider: Provider, model: string) => Record<string, string>;
  buildArgs: (model: string, extraArgs: string[]) => string[];
}

export interface AgentProfile {
  id: string;
  name: string;
  toolId: ToolId;
  description: string;
  extraArgs: string[];
}

export interface AppConfig {
  providers: Provider[];
}

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}
