import { spawn, spawnSync } from "node:child_process";
import type { Provider, ToolDefinition } from "../types.js";

export function isBinaryInstalled(tool: ToolDefinition): boolean {
  const result = spawnSync(tool.binary, tool.versionArgs, { stdio: "ignore" });
  return result.status === 0;
}

export function launchTool(
  tool: ToolDefinition,
  provider: Provider,
  model: string,
  extraArgs: string[] = []
): Promise<number> {
  const env = { ...process.env, ...tool.buildEnv(provider, model) };
  const args = tool.buildArgs(model, extraArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(tool.binary, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
