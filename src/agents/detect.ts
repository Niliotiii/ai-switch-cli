import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import type { AgentDefinition, AgentStatus } from "../types.js";
import { listAgentDefinitions } from "./catalog.js";

export type SpawnProbeFn = (bin: string, args: string[], opts: { stdio: "ignore"; shell?: boolean }) => { status: number | null };

const isWindows = platform() === "win32";

/**
 * Fast path: resolve the binary on PATH without launching the agent itself. `command -v` (POSIX) /
 * `where` (Windows) returns exit 0 when the binary exists and is executable. This avoids spawning the
 * agent just to probe its version — some agents print --version to stderr with a non-zero exit, or
 * hang on a first-run auth prompt, which previously produced false "not installed" results.
 */
function resolvesOnPath(binary: string, spawn: SpawnProbeFn): boolean {
  const cmd = isWindows ? "where" : "command";
  const args = isWindows ? [binary] : ["-v", binary];
  try {
    return spawn(cmd, args, { stdio: "ignore", shell: isWindows }).status === 0;
  } catch {
    return false;
  }
}

/**
 * An agent is "installed" when its binary resolves on PATH. We prefer the fast PATH lookup (no spawn
 * of the agent itself); the versionArgs probe is the fallback for environments where `command -v` /
 * `where` is unavailable (e.g. stripped containers). Both stages share the injected `spawn` so tests
 * fully control detection by mocking a single probe function.
 */
export function isAgentInstalled(agent: AgentDefinition, spawn: SpawnProbeFn = spawnSync): boolean {
  if (resolvesOnPath(agent.binary, spawn)) return true;
  return spawn(agent.binary, agent.versionArgs, { stdio: "ignore" }).status === 0;
}

export function detectAgents(agents: AgentDefinition[] = listAgentDefinitions(), spawn: SpawnProbeFn = spawnSync): AgentStatus[] {
  return agents.map((definition) => ({ definition, installed: isAgentInstalled(definition, spawn) }));
}
