import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  return process.env.AI_SWITCH_CONFIG_DIR ?? path.join(os.homedir(), ".config", "ai-switch");
}

export function getConfigFile(): string {
  return path.join(getConfigDir(), "config.json");
}
