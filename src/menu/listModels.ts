import { listProviders } from '../config/providers.js';
import { fetchModels } from '../discovery/models.js';
import { promptChoice } from '../ui/prompts.js';
import { renderTable } from '../ui/table.js';
import { theme } from '../ui/theme.js';

export async function listModelsFlow(): Promise<void> {
  console.log(theme.heading('\nVer Modelos'));

  const providers = listProviders();
  if (providers.length === 0) {
    console.log(
      theme.fail(
        'Nenhum provedor cadastrado. Use "Cadastrar Novo Provedor" primeiro.',
      ),
    );
    return;
  }

  const providerName = await promptChoice(
    'Selecione o provedor:',
    providers.map((p) => ({ name: p.name, value: p.name })),
  );
  const provider = providers.find((p) => p.name === providerName)!;

  try {
    const models = await fetchModels(provider);
    console.log(
      renderTable(
        ['Modelo'],
        models.map((m) => [m.id]),
      ),
    );
  } catch (error) {
    console.log(
      theme.fail(
        `Falha ao consultar modelos: ${error instanceof Error ? error.message : error}`,
      ),
    );
  }
}
