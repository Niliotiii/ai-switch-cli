import { spawn } from "node:child_process";
import type { AgentDefinition, Provider } from "../types.js";
import { anthropicEnv, openaiEnv } from "../tools/env.js";

export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string> {
  // prepareLaunch agents (opencode) use a config file, not env vars — return {} so no OPENAI_* leaks.
  if (agent.authStrategy === "self-contained" || provider === null || agent.prepareLaunch) return {};
  if (agent.envBuilder) return agent.envBuilder(provider, model);
  return agent.envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider);
}

export async function launchAgent(agent: AgentDefinition, provider: Provider | null, model: string, spawnFn: typeof spawn = spawn): Promise<number> {
  // prepareLaunch runs side effects before spawn (e.g. write the opencode.json provider entry).
  if (agent.prepareLaunch && provider !== null) {
    await agent.prepareLaunch(provider, model);
  }
  const env = { ...process.env, ...buildAgentEnv(agent, provider, model) };
  const args = agent.buildArgs(provider, model);
  return new Promise((resolve, reject) => {
    const child = spawnFn(agent.binary, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
