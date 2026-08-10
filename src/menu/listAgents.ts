import { detectAgents } from '../agents/detect.js';
import { renderTable } from '../ui/table.js';
import { theme } from '../ui/theme.js';

export function listAgentsFlow(): void {
  console.log(theme.heading('\nVer Agents'));
  const statuses = detectAgents();
  const rows = statuses.map((s) => [
    s.definition.label,
    s.definition.binary,
    s.installed ? theme.ok('instalado') : theme.fail('não instalado'),
    s.installed ? '' : s.definition.homepage,
  ]);
  console.log(renderTable(['Agente', 'Binário', 'Status', 'Instalação'], rows));
}
