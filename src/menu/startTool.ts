import { listProviders } from "../config/providers.js";
import { getAgentDefinition } from "../agents/catalog.js";
import { detectAgents } from "../agents/detect.js";
import { launchAgent } from "../agents/launch.js";
import { fetchModels } from "../discovery/models.js";
import { promptChoiceWithBack, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";
import type { Provider } from "../types.js";

export async function startToolFlow(): Promise<void> {
  console.log(theme.heading("\nIniciar Agent"));

  const installed = detectAgents().filter((s) => s.installed);
  if (installed.length === 0) {
    console.log(theme.fail("Nenhum agente detectado. Instale claude, codex, opencode, copilot ou antigravity."));
    return;
  }

  const agentId = await promptChoiceWithBack(
    "Selecione o agente:",
    installed.map((s) => ({ name: s.definition.label, value: s.definition.id }))
  );
  if (agentId === null) return; // Voltar → menu principal
  const agent = getAgentDefinition(agentId);

  let provider = null;
  let model = "";
  if (agent.authStrategy === "env-inject") {
    const providers = listProviders();
    if (providers.length === 0) {
      console.log(theme.fail("Nenhum provedor cadastrado. Use \"Gerenciar Provedores\" primeiro."));
      return;
    }
    const providerName = await promptChoiceWithBack(
      "Selecione o provedor:",
      providers.map((p) => ({ name: p.name, value: p.name }))
    );
    if (providerName === null) return; // Voltar → menu principal
    const selected = providers.find((p) => p.name === providerName)!;
    const url = agent.envProtocol === "anthropic" ? selected.anthropicBaseUrl : selected.openaiBaseUrl;
    if (!url) {
      const protocol = agent.envProtocol === "anthropic" ? "Anthropic" : "OpenAI";
      console.log(theme.fail(`Provedor "${selected.name}" não tem URL ${protocol} configurada. Edite o provedor para adicioná-la.`));
      return;
    }
    provider = selected;
    if (agent.requiresModel !== false) {
      const selectedModel = await selectModel(selected);
      if (selectedModel === null) return; // Voltar → menu principal
      model = selectedModel;
    }
  }

  console.log(theme.ok(`\nIniciando ${agent.label}...\n`));
  const exitCode = await launchAgent(agent, provider, model);
  if (exitCode !== 0) {
    console.log(theme.fail(`${agent.label} encerrou com código ${exitCode}.`));
  }
}

async function selectModel(provider: Provider): Promise<string | null> {
  try {
    const models = await fetchModels(provider);
    if (models.length === 0) throw new Error("nenhum modelo retornado");
    return await promptChoiceWithBack(
      "Selecione o modelo:",
      models.map((m) => ({ name: m.id, value: m.id }))
    );
  } catch (error) {
    console.log(theme.fail(`Não foi possível listar modelos automaticamente (${error instanceof Error ? error.message : error}).`));
    return await promptText("Digite o nome do modelo manualmente:");
  }
}
