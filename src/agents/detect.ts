import { spawnSync } from "node:child_process";
import type { AgentDefinition, AgentStatus } from "../types.js";
import { listAgentDefinitions } from "./catalog.js";

export type SpawnProbeFn = (bin: string, args: string[], opts: { stdio: "ignore" }) => { status: number | null };

export function isAgentInstalled(agent: AgentDefinition, spawn: SpawnProbeFn = spawnSync): boolean {
  return spawn(agent.binary, agent.versionArgs, { stdio: "ignore" }).status === 0;
}

export function detectAgents(agents: AgentDefinition[] = listAgentDefinitions(), spawn: SpawnProbeFn = spawnSync): AgentStatus[] {
  return agents.map((definition) => ({ definition, installed: isAgentInstalled(definition, spawn) }));
}
