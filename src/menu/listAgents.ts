import { listAgents } from "../agents/registry.js";
import { getTool } from "../tools/registry.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";

export function listAgentsFlow(): void {
  console.log(theme.heading("\nVer Agents Disponíveis"));
  const rows = listAgents().map((agent) => [agent.name, getTool(agent.toolId).label, agent.description]);
  console.log(renderTable(["Agent", "Ferramenta", "Descrição"], rows));
}
