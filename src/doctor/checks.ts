import type { DoctorCheckResult, Provider } from "../types.js";
import { listAgentDefinitions } from "../agents/catalog.js";
import { isAgentInstalled } from "../agents/detect.js";
import { fetchModels } from "../discovery/models.js";
import { pickBaseUrl } from "../tools/url.js";

export function checkAgents(): DoctorCheckResult[] {
  return listAgentDefinitions().map((agent) => {
    const ok = isAgentInstalled(agent);
    return {
      label: `Agente: ${agent.label}`,
      ok,
      detail: ok ? `binário "${agent.binary}" encontrado` : `binário "${agent.binary}" não encontrado no PATH`,
    };
  });
}

export async function checkProvider(provider: Provider): Promise<DoctorCheckResult> {
  const picked = pickBaseUrl(provider);
  if (!picked) {
    return { label: `Provedor: ${provider.name}`, ok: false, detail: "nenhuma URL configurada" };
  }
  const protocol = picked.protocol === "openai" ? "OpenAI" : "Anthropic";
  try {
    const models = await fetchModels(provider);
    return { label: `Provedor: ${provider.name}`, ok: true, detail: `conectado via ${protocol}, ${models.length} modelo(s) disponível(is)` };
  } catch (error) {
    return { label: `Provedor: ${provider.name}`, ok: false, detail: error instanceof Error ? error.message : "erro desconhecido" };
  }
}

export async function runDoctor(providers: Provider[]): Promise<DoctorCheckResult[]> {
  const agentChecks = checkAgents();
  const providerChecks = await Promise.all(providers.map(checkProvider));
  return [...agentChecks, ...providerChecks];
}
