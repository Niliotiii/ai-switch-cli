import { listAgentsByTool } from "../agents/registry.js";
import { listProviders } from "../config/providers.js";
import { fetchModels } from "../discovery/models.js";
import { isBinaryInstalled, launchTool } from "../tools/launcher.js";
import { getProtocolBaseUrl, getTool, listTools } from "../tools/registry.js";
import { promptChoice, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

export async function startToolFlow(): Promise<void> {
  console.log(theme.heading("\nIniciar Ferramenta"));

  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado. Use \"Cadastrar Novo Provedor\" primeiro."));
    return;
  }

  const toolId = await promptChoice(
    "Selecione a ferramenta de desenvolvimento:",
    listTools().map((t) => ({ name: t.label, value: t.id }))
  );
  const tool = getTool(toolId);

  if (!isBinaryInstalled(tool)) {
    console.log(theme.fail(`Binário "${tool.binary}" não encontrado no PATH. Instale-o antes de continuar.`));
    return;
  }

  const providerName = await promptChoice(
    "Selecione o provedor:",
    providers.map((p) => ({ name: p.name, value: p.name }))
  );
  const provider = providers.find((p) => p.name === providerName)!;

  const baseUrl = getProtocolBaseUrl(tool, provider);
  if (!baseUrl) {
    const protocol = tool.id === "claude-code" ? "Anthropic" : "OpenAI";
    console.log(
      theme.fail(
        `Provedor "${provider.name}" não tem URL ${protocol} configurada. Edite o provedor para adicioná-la.`
      )
    );
    return;
  }

  let model: string;
  try {
    const models = await fetchModels(provider);
    if (models.length === 0) throw new Error("nenhum modelo retornado");
    model = await promptChoice(
      "Selecione o modelo:",
      models.map((m) => ({ name: m.id, value: m.id }))
    );
  } catch (error) {
    console.log(
      theme.fail(`Não foi possível listar modelos automaticamente (${error instanceof Error ? error.message : error}).`)
    );
    model = await promptText("Digite o nome do modelo manualmente:");
  }

  const agents = listAgentsByTool(toolId);
  const agentId = await promptChoice(
    "Selecione o agente de atuação:",
    agents.map((a) => ({ name: `${a.name} — ${a.description}`, value: a.id }))
  );
  const agent = agents.find((a) => a.id === agentId)!;

  console.log(theme.ok(`\nIniciando ${tool.label} com provedor "${provider.name}" e modelo "${model}"...\n`));
  const exitCode = await launchTool(tool, provider, model, agent.extraArgs);
  if (exitCode !== 0) {
    console.log(theme.fail(`${tool.label} encerrou com código ${exitCode}.`));
  }
}
