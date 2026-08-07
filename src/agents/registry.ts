import type { AgentProfile, ToolId } from "../types.js";

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "claude-code-default",
    name: "Coding Assistant",
    toolId: "claude-code",
    description: "Modo padrão de pair-programming interativo do Claude Code.",
    extraArgs: [],
  },
  {
    id: "aider-default",
    name: "Coding Assistant",
    toolId: "aider",
    description: "Modo padrão de edição de código do Aider.",
    extraArgs: [],
  },
  {
    id: "aider-architect",
    name: "Architect",
    toolId: "aider",
    description: "Aider em modo de planejamento arquitetural antes de editar código.",
    extraArgs: ["--architect"],
  },
  {
    id: "open-interpreter-default",
    name: "Coding Assistant",
    toolId: "open-interpreter",
    description: "Modo padrão de execução de código do Open Interpreter.",
    extraArgs: [],
  },
];

export function listAgents(): AgentProfile[] {
  return AGENT_PROFILES;
}

export function listAgentsByTool(toolId: ToolId): AgentProfile[] {
  return AGENT_PROFILES.filter((a) => a.toolId === toolId);
}
