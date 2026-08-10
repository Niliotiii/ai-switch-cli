import { deleteProvider, listProviders, updateProvider } from "../config/providers.js";
import { promptChoice, promptSecret, promptText } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";
import { registerProviderFlow } from "./registerProvider.js";

type SubmenuOption = "list" | "register" | "edit" | "delete" | "back";

async function listProvidersFlow(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado."));
    return;
  }
  const rows = providers.map((p) => [p.name, p.baseUrl, p.createdAt]);
  console.log(renderTable(["Nome", "URL Base", "Criado em"], rows));
}

async function editProviderFlow(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado para editar."));
    return;
  }
  const id = await promptChoice(
    "Selecione o provedor a editar:",
    providers.map((p) => ({ name: p.name, value: p.id }))
  );
  const current = providers.find((p) => p.id === id)!;

  const newName = await promptText(
    `Nome [${current.name}]:`,
    (value) => {
      const v = value.trim() || current.name;
      if (v === "") return "O nome não pode ser vazio";
      if (v.toLowerCase() !== current.name.toLowerCase()) {
        if (listProviders().some((p) => p.id !== current.id && p.name.toLowerCase() === v.toLowerCase())) {
          return `Já existe um provedor chamado "${v}"`;
        }
      }
      return true;
    },
    current.name
  );
  const newBaseUrl = await promptText(
    `URL base [${current.baseUrl}]:`,
    (value) => {
      const v = value.trim() || current.baseUrl;
      if (v === "") return true;
      try {
        new URL(v);
        return true;
      } catch {
        return "URL inválida";
      }
    },
    current.baseUrl
  );
  const newApiKeyRaw = await promptSecret(
    "Nova API Key (pressione Enter para manter a atual):"
  );

  try {
    const updated = updateProvider(current.id, {
      name: newName.trim() || current.name,
      baseUrl: newBaseUrl.trim() || current.baseUrl,
      apiKey: newApiKeyRaw.trim() === "" ? undefined : newApiKeyRaw,
    });
    console.log(theme.ok(`\nProvedor "${updated.name}" atualizado com sucesso.`));
  } catch (error) {
    console.log(theme.fail(`Falha ao atualizar: ${error instanceof Error ? error.message : error}`));
  }
}

async function deleteProviderFlow(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado para remover."));
    return;
  }
  const id = await promptChoice(
    "Selecione o provedor a remover:",
    providers.map((p) => ({ name: p.name, value: p.id }))
  );
  const target = providers.find((p) => p.id === id)!;
  const confirmPhrase = `remover ${target.name}`;
  const typed = await promptText(
    `Esta ação é permanente. Digite exatamente "${confirmPhrase}" para confirmar:`
  );
  if (typed !== confirmPhrase) {
    console.log(theme.fail("Confirmação não confere. Provedor não foi removido."));
    return;
  }
  try {
    const removed = deleteProvider(target.id);
    console.log(theme.ok(`\nProvedor "${removed.name}" removido com sucesso.`));
  } catch (error) {
    console.log(theme.fail(`Falha ao remover: ${error instanceof Error ? error.message : error}`));
  }
}

export async function manageProvidersFlow(): Promise<void> {
  console.log(theme.heading("\nGerenciar Provedores"));

  let inSubmenu = true;
  while (inSubmenu) {
    const choice = await promptChoice<SubmenuOption>("Selecione uma opção:", [
      { name: "1. Listar Provedores Cadastrados", value: "list" },
      { name: "2. Cadastrar Novo Provedor", value: "register" },
      { name: "3. Editar Provedor", value: "edit" },
      { name: "4. Remover Provedor", value: "delete" },
      { name: "0. Voltar ao menu principal", value: "back" },
    ]);

    switch (choice) {
      case "list":
        await listProvidersFlow();
        break;
      case "register":
        await registerProviderFlow();
        break;
      case "edit":
        await editProviderFlow();
        break;
      case "delete":
        await deleteProviderFlow();
        break;
      case "back":
        inSubmenu = false;
        break;
    }
  }
}
