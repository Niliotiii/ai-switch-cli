import { spawn } from "node:child_process";
import type { AgentDefinition, Provider } from "../types.js";
import { anthropicEnv, openaiEnv } from "../tools/env.js";

export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null): Record<string, string> {
  if (agent.authStrategy === "self-contained" || provider === null) return {};
  return agent.envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider);
}

export function launchAgent(agent: AgentDefinition, provider: Provider | null, spawnFn: typeof spawn = spawn): Promise<number> {
  const env = { ...process.env, ...buildAgentEnv(agent, provider) };
  return new Promise((resolve, reject) => {
    const child = spawnFn(agent.binary, [], { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
