import { addProvider, providerNameExists } from "../config/providers.js";
import { promptSecret, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

export async function registerProviderFlow(): Promise<void> {
  console.log(theme.heading("\nCadastrar Novo Provedor"));

  const name = await promptText("Nome identificador único do provedor:", (value) => {
    if (!value.trim()) return "O nome não pode ser vazio";
    if (providerNameExists(value.trim())) return `Já existe um provedor chamado "${value.trim()}"`;
    return true;
  });

  const baseUrl = await promptText("URL base do serviço (ex: https://openrouter.ai/api/v1):", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return "URL inválida";
    }
  });

  const apiKey = await promptSecret("Chave de autenticação (API Key):");

  const provider = addProvider({ name: name.trim(), baseUrl: baseUrl.trim(), apiKey });
  console.log(theme.ok(`\nProvedor "${provider.name}" cadastrado com sucesso.`));
}
