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
  /**
   * When present, the agent supports a "no-approval" / skip-permissions mode and these CLI flags
   * enable it. The start menu only offers the toggle when this is defined; launchAgent concatenates
   * the flags after buildArgs when skipPermissions is true. Omit the field for agents without a
   * stable public flag — the CLI will then refuse to launch with skipPermissions=true rather than
   * guess one and pass an unrecognized flag.
   */
  skipPermissionsArgs?: string[];
  /**
   * Arquivos de instruções que este agente lê nativamente ao iniciar, relativos à raiz do projeto
   * (ex.: "CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md"). É por aqui que o contexto
   * do projeto atravessa a troca de provedor/modelo: o CLI faz merge de um bloco delimitado nesses
   * arquivos antes do spawn, então o agente já boota sabendo arquitetura, padrões, decisões e o
   * histórico das sessões anteriores. Obrigatório (como buildArgs) para que nenhum agente novo
   * entre no catálogo sem uma decisão explícita sobre onde seu contexto é injetado. Paths devem ser
   * relativos e não escapar da raiz do projeto.
   */
  contextFiles: string[];
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
  lastSelection?: LastSelection | null;
}

/** Uma sessão encerrada, registrada para que o próximo modelo — possivelmente em outro provedor —
 *  continue de onde a anterior parou em vez de ouvir o usuário repetir tudo. Nunca guarda credencial:
 *  identifica o provedor pelo nome, não pelo id nem pela apiKey. */
export interface ContextHandoff {
  at: string; // ISO
  agentId: AgentId;
  providerName: string;
  model: string;
  summary: string;
}

/** As quatro coisas que o usuário hoje redigita a cada troca de modelo. Strings vazias e arrays
 *  vazios são o estado "não preenchido" — o renderizador omite a seção em vez de imprimi-la vazia. */
export interface ContextSections {
  architecture: string;
  patterns: string;
  goal: string;
  decisions: string[];
}

/** Contexto de um projeto, portável entre agentes e provedores. Escopo é o repositório (resolvido
 *  por `projectPath`), não o provedor — o provedor é a peça intercambiável. */
export interface ContextPack {
  id: string;
  name: string;
  projectPath: string; // absoluto
  /** Consentimento explícito para escrever nos arquivos do repositório do usuário. Nasce `false`:
   *  injetar contexto altera arquivos versionados, então nunca é o default. */
  injectionEnabled: boolean;
  sections: ContextSections;
  handoffs: ContextHandoff[]; // append-only; o teto de renderização vive em context/render.ts
  createdAt: string;
  updatedAt: string;
}

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}
