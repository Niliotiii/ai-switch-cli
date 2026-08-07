import type { DoctorCheckResult, Provider } from "../types.js";
import { listTools } from "../tools/registry.js";
import { isBinaryInstalled } from "../tools/launcher.js";
import { fetchModels } from "../discovery/models.js";

export function checkTools(): DoctorCheckResult[] {
  return listTools().map((tool) => {
    const ok = isBinaryInstalled(tool);
    return {
      label: `Ferramenta: ${tool.label}`,
      ok,
      detail: ok ? `binário "${tool.binary}" encontrado` : `binário "${tool.binary}" não encontrado no PATH`,
    };
  });
}

export async function checkProvider(provider: Provider): Promise<DoctorCheckResult> {
  try {
    const models = await fetchModels(provider);
    return {
      label: `Provedor: ${provider.name}`,
      ok: true,
      detail: `conectado, ${models.length} modelo(s) disponível(is)`,
    };
  } catch (error) {
    return {
      label: `Provedor: ${provider.name}`,
      ok: false,
      detail: error instanceof Error ? error.message : "erro desconhecido",
    };
  }
}

export async function runDoctor(providers: Provider[]): Promise<DoctorCheckResult[]> {
  const toolChecks = checkTools();
  const providerChecks = await Promise.all(providers.map(checkProvider));
  return [...toolChecks, ...providerChecks];
}
