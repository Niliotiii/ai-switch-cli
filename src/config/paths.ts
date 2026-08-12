import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  return process.env.AI_SWITCH_CONFIG_DIR ?? path.join(os.homedir(), ".config", "ai-switch");
}

export function getConfigFile(): string {
  return path.join(getConfigDir(), "config.json");
}

/** Um arquivo por context pack, fora do `config.json`: handoffs crescem a cada sessão e não devem
 *  inflar o arquivo que é lido em toda operação de provedor. */
export function getContextsDir(): string {
  return path.join(getConfigDir(), "contexts");
}

/** Raiz do projeto onde o contexto é injetado. Sobrescrevível para que os testes escrevam em tmpdir
 *  em vez de sujar o repositório real — o mesmo seam que AI_SWITCH_CONFIG_DIR oferece para a config. */
export function getProjectDir(): string {
  return process.env.AI_SWITCH_PROJECT_DIR ?? process.cwd();
}
