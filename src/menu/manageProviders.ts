import { listProviders, updateProvider, deleteProvider } from "../config/providers.js";
import { registerProviderFlow } from "./registerProvider.js";
import { promptChoice, promptText, promptSecret, promptConfirm } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";

export async function manageProvidersFlow(): Promise<void> {
  while (true) {
    console.log(theme.heading("\n=== Gerenciar Provedores ==="));
    console.log(renderTable(["Nome", "URL Base", "Criado em"], listProviders().map((p) => [
      p.name,
      p.baseUrl,
      new Date(p.createdAt).toLocaleString(),
    ])));

    const choice = await promptChoice("Selecione uma opção:", [
      { name: "1. Cadastrar Novo Provedor", value: "cadastrar" },
      { name: "2. Editar Provedor", value: "editar" },
      { name: "3. Remover Provedor", value: "remover" },
      { name: "0. Voltar ao menu principal", value: "voltar" },
    ]);

    if (choice === "cadastrar") {
      await registerProviderFlow();
    } else if (choice === "editar") {
      await editProvider();
    } else if (choice === "remover") {
      await removeProvider();
    } else if (choice === "voltar") {
      return;
    }
  }
}

async function editProvider(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.dim("(nenhum registro encontrado)"));
    return;
  }
  const providerChoices = providers.map((p) => ({ name: p.name, value: p.id }));
  const providerName = await promptChoice("Selecione o provedor para editar:", providerChoices);
  const provider = providers.find((p) => p.id === providerName)!;
  const newNameRaw = await promptText(`Nome [${provider.name}]:`, (value) => {
    if (!value.trim()) return "O nome não pode ser vazio";
    if (value.trim().toLowerCase() !== provider.name.toLowerCase()) {
      if (listProviders().some((p) => p.id !== provider.id && p.name.toLowerCase() === value.trim().toLowerCase())) {
        return `Já existe um provedor chamado "${value.trim()}"`;
      }
    }
    return true;
  });
  const newName = newNameRaw.trim() || provider.name;
  const newBaseUrlRaw = await promptText(`URL base [${provider.baseUrl}]:`, (value) => {
    if (value.trim()) {
      try {
        new URL(value.trim());
        return true;
      } catch {
        return "URL inválida";
      }
    }
    return true;
  });
  const newBaseUrl = newBaseUrlRaw.trim() || provider.baseUrl;
  const newApiKeyRaw = await promptSecret("API Key (pressione Enter para manter a atual):");
  const newApiKey = newApiKeyRaw.trim() || provider.apiKey;
  const updated = updateProvider(provider.id, { name: newName, baseUrl: newBaseUrl, apiKey: newApiKey });
  console.log(theme.ok(`\nProvedor "${updated.name}" atualizado com sucesso.`));
}

async function removeProvider(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) {
    console.log(theme.dim("(nenhum registro encontrado)"));
    return;
  }
  const providerChoices = providers.map((p) => ({ name: p.name, value: p.id }));
  const providerName = await promptChoice("Selecione o provedor para remover:", providerChoices);
  const provider = providers.find((p) => p.id === providerName)!;
  const typed = await promptText(
    `Digite 'remover ${provider.name}' para confirmar exclusão:
     (isso excluirá permanentemente o provedor)`,
    (value) => {
      if (value.trim() === `remover ${provider.name}`) {
        return true;
      }
      return "Entrada incorreta. Digite exatamente o texto pedido para confirmar.";
    }
  );
  const removed = deleteProvider(provider.id);
  console.log(theme.ok(`\nProvedor "${removed.name}" removido com sucesso.`));
}