import fs from "node:fs";
import type { AppConfig } from "../types.js";
import { getConfigDir, getConfigFile } from "./paths.js";

export function readConfig(): AppConfig {
  const file = getConfigFile();
  if (!fs.existsSync(file)) {
    return { providers: [] };
  }
  const raw = fs.readFileSync(file, "utf-8");
  try {
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { providers: [] };
  }
}

export function writeConfig(config: AppConfig): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = getConfigFile();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
