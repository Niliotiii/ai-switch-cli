import { spawn } from "node:child_process";
import type { AgentDefinition, ContextPack, Provider } from "../types.js";
import { anthropicEnv, openaiEnv } from "../tools/env.js";
import { injectContext } from "../context/inject.js";

export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string> {
  // prepareLaunch agents (opencode) use a config file, not env vars — return {} so no OPENAI_* leaks.
  if (agent.authStrategy === "self-contained" || provider === null || agent.prepareLaunch) return {};
  if (agent.envBuilder) return agent.envBuilder(provider, model);
  return agent.envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider);
}

export interface LaunchOptions {
  /** When true, append the agent's `skipPermissionsArgs` to the spawned command (no-approval mode).
   *  Throws if the agent has no `skipPermissionsArgs` — never silently pass a guessed flag. */
  skipPermissions?: boolean;
  /** When present, merges this project's context pack into the agent's `contextFiles` before spawn
   *  (no-op if `pack.injectionEnabled` is false). A throw here (e.g. an orphaned marker in the
   *  target file) propagates and aborts the launch — the caller decides whether to retry without
   *  context, launchAgent itself never launches silently without the context it was asked to inject.
   *  `startTool.ts` deliberately does NOT use this field — it calls `injectContext` directly so its
   *  own try/catch wraps injection alone, not the whole launch (including the spawn). This option
   *  exists for callers that want injection folded into a single call (see tests/agents/launch.test.ts). */
  context?: ContextPack;
}

export async function launchAgent(
  agent: AgentDefinition,
  provider: Provider | null,
  model: string,
  options: LaunchOptions = {},
  spawnFn: typeof spawn = spawn,
): Promise<number> {
  if (options.skipPermissions) {
    if (!agent.skipPermissionsArgs) {
      // Refuse instead of guessing a flag for an unsupported agent. The menu is supposed to gate
      // this prompt, so reaching here means a programming error — surface it loudly.
      throw new Error(`O agente "${agent.label}" não suporta o modo sem aprovação (sem flag pública conhecida).`);
    }
  }
  // Must land on disk before the agent boots and reads its instructions file, so this runs before
  // prepareLaunch and the spawn itself.
  if (options.context) {
    injectContext(options.context, agent);
  }
  // prepareLaunch runs side effects before spawn (e.g. write the opencode.json provider entry).
  if (agent.prepareLaunch && provider !== null) {
    await agent.prepareLaunch(provider, model);
  }
  const env = { ...process.env, ...buildAgentEnv(agent, provider, model) };
  const args = [...agent.buildArgs(provider, model)];
  if (options.skipPermissions) args.push(...agent.skipPermissionsArgs!);
  return new Promise((resolve, reject) => {
    const child = spawnFn(agent.binary, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
