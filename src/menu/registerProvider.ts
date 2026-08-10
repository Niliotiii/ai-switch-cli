import { addProvider, providerNameExists } from "../config/providers.js";
import { promptSecret, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";
import { normalizeUrl, validateUrl } from "../tools/url.js";

export async function registerProviderFlow(): Promise<void> {
  console.log(theme.heading("\nCadastrar Novo Provedor"));

  const name = await promptText("Nome identificador único do provedor:", (value) => {
    if (!value.trim()) return "O nome não pode ser vazio";
    if (providerNameExists(value.trim())) return `Já existe um provedor chamado "${value.trim()}"`;
    return true;
  });

  const anthropicRaw = await promptText(
    "URL base Anthropic (Enter para pular se o provedor não usar este protocolo):",
    validateUrl
  );
  const openaiRaw = await promptText(
    "URL base OpenAI (Enter para pular se o provedor não usar este protocolo):",
    validateUrl
  );

  const anthropicBaseUrl = normalizeUrl(anthropicRaw);
  const openaiBaseUrl = normalizeUrl(openaiRaw);
  if (!anthropicBaseUrl && !openaiBaseUrl) {
    console.log(theme.fail("Informe pelo menos uma URL (Anthropic ou OpenAI)."));
    return;
  }

  const apiKey = await promptSecret("Chave de autenticação (API Key):");

  try {
    const provider = addProvider({ name: name.trim(), anthropicBaseUrl, openaiBaseUrl, apiKey });
    console.log(theme.ok(`\nProvedor "${provider.name}" cadastrado com sucesso.`));
  } catch (error) {
    console.log(theme.fail(`Falha ao cadastrar: ${error instanceof Error ? error.message : error}`));
  }
}
