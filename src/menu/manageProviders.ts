import { deleteProvider, listProviders, updateProvider } from "../config/providers.js";
import { promptChoiceWithBack, promptSecret, promptText } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";
import { registerProviderFlow } from "./registerProvider.js";

type SubmenuOption = "list" | "register" | "edit" | "delete";

async function listProvidersFlow(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado."));
    return;
  }
  const rows = providers.map((p) => [
    p.name,
    p.anthropicBaseUrl ?? "—",
    p.openaiBaseUrl ?? "—",
    p.createdAt,
  ]);
  console.log(renderTable(["Nome", "URL Anthropic", "URL OpenAI", "Criado em"], rows));
}

async function editProviderFlow(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.fail("Nenhum provedor cadastrado para editar."));
    return;
  }
  const id = await promptChoiceWithBack(
    "Selecione o provedor a editar:",
    providers.map((p) => ({ name: p.name, value: p.id }))
  );
  if (id === null) return; // Voltar → submenu Gerenciar Provedores
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
  const newAnthropicRaw = await promptText(
    `URL Anthropic [${current.anthropicBaseUrl ?? "—"}]:`,
    (value) => {
      if (!value.trim()) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return "URL inválida";
      }
    },
    current.anthropicBaseUrl ?? undefined
  );
  const newOpenaiRaw = await promptText(
    `URL OpenAI [${current.openaiBaseUrl ?? "—"}]:`,
    (value) => {
      if (!value.trim()) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return "URL inválida";
      }
    },
    current.openaiBaseUrl ?? undefined
  );
  const newApiKeyRaw = await promptSecret(
    "Nova API Key (pressione Enter para manter a atual):"
  );

  try {
    const updated = updateProvider(current.id, {
      name: newName.trim() || current.name,
      anthropicBaseUrl: newAnthropicRaw.trim() === "" ? current.anthropicBaseUrl : newAnthropicRaw.trim(),
      openaiBaseUrl: newOpenaiRaw.trim() === "" ? current.openaiBaseUrl : newOpenaiRaw.trim(),
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
  const id = await promptChoiceWithBack(
    "Selecione o provedor a remover:",
    providers.map((p) => ({ name: p.name, value: p.id }))
  );
  if (id === null) return; // Voltar → submenu Gerenciar Provedores
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
    const choice = await promptChoiceWithBack<SubmenuOption>("Selecione uma opção:", [
      { name: "1. Listar", value: "list" },
      { name: "2. Cadastrar", value: "register" },
      { name: "3. Editar", value: "edit" },
      { name: "4. Remover", value: "delete" },
    ]);

    if (choice === null) {
      inSubmenu = false; // Voltar → menu principal
      continue;
    }
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
    }
  }
}
