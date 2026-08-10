import { promptChoice } from '../ui/prompts.js';
import { theme } from '../ui/theme.js';
import { doctorFlow } from './doctorMenu.js';
import { listAgentsFlow } from './listAgents.js';
import { listModelsFlow } from './listModels.js';
import { manageProvidersFlow } from './manageProviders.js';
import { startToolFlow } from './startTool.js';

type MenuOption = 'start' | 'manage' | 'models' | 'agents' | 'doctor' | 'exit';

export async function runMainMenu(): Promise<void> {
  console.log(theme.heading('AI Switch CLI'));
  console.log(
    theme.dim('Centralize e alterne entre provedores e agentes de IA.\n'),
  );

  let running = true;
  while (running) {
    const choice = await promptChoice<MenuOption>('Selecione uma opção:', [
      { name: '1. Iniciar Agent', value: 'start' },
      { name: '2. Gerenciar Provedores', value: 'manage' },
      { name: '3. Ver Modelos', value: 'models' },
      { name: '4. Ver Agents', value: 'agents' },
      { name: '5. Diagnóstico', value: 'doctor' },
      { name: '6. Sair', value: 'exit' },
    ]);

    switch (choice) {
      case 'start':
        await startToolFlow();
        break;
      case 'manage':
        await manageProvidersFlow();
        break;
      case 'models':
        await listModelsFlow();
        break;
      case 'agents':
        await listAgentsFlow();
        break;
      case 'doctor':
        await doctorFlow();
        break;
      case 'exit':
        running = false;
        console.log(theme.dim('\nAté logo!'));
        break;
    }
  }
}
