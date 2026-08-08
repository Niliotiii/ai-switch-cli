import { doctorFlow } from "./doctorMenu.js";
import { listAgentsFlow } from "./listAgents.js";
import { listModelsFlow } from "./listModels.js";
import { registerProviderFlow } from "./registerProvider.js";
import { startToolFlow } from "./startTool.js";
import { promptChoice } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

type MenuOption = "start" | "register" | "models" | "agents" | "doctor" | "exit";

export async function runMainMenu(): Promise<void> {
  console.log(theme.heading("AI Switch CLI"));
  console.log(theme.dim("Centralize e alterne entre provedores e ferramentas de IA.\n"));

  let running = true;
  while (running) {
    const choice = await promptChoice<MenuOption>("Selecione uma opção:", [
      { name: "1. Iniciar Ferramenta", value: "start" },
      { name: "2. Cadastrar Novo Provedor", value: "register" },
      { name: "3. Ver Modelos Disponíveis", value: "models" },
      { name: "4. Ver Agents Disponíveis", value: "agents" },
      { name: "5. Diagnóstico (Doctor)", value: "doctor" },
      { name: "6. Sair", value: "exit" },
    ]);

    switch (choice) {
      case "start":
        await startToolFlow();
        break;
      case "register":
        await registerProviderFlow();
        break;
      case "models":
        await listModelsFlow();
        break;
      case "agents":
        listAgentsFlow();
        break;
      case "doctor":
        await doctorFlow();
        break;
      case "exit":
        running = false;
        console.log(theme.dim("\nAté logo!"));
        break;
    }
  }
}
