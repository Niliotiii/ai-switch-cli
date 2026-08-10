import type { Model, Provider } from "../types.js";

export async function fetchModels(provider: Provider): Promise<Model[]> {
  const baseUrl = provider.openaiBaseUrl ?? provider.anthropicBaseUrl;
  if (!baseUrl) {
    throw new Error("Nenhuma URL configurada para este provedor");
  }
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  const data = body.data ?? [];
  return data.map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
}
