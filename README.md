# AI Switch CLI

CLI universal para centralizar, gerenciar e alternar entre provedores de IA e ferramentas de desenvolvimento (Claude Code, Aider, Open Interpreter).

## Instalação

```bash
npm install
npm run build
npm link
```

## Uso

```bash
ai-switch
```

Navegue pelo menu numérico para cadastrar provedores, consultar modelos, listar agentes, iniciar uma ferramenta ou rodar o diagnóstico (doctor).

Cada provedor pode ter duas URLs base: uma para o **protocolo Anthropic** (usada pelo Claude Code) e uma para o **protocolo OpenAI** (usada pelo Aider e Open Interpreter). Informe pelo menos uma delas ao cadastrar. Ao **Iniciar Ferramenta**, o provedor precisa ter a URL do protocolo correspondente à ferramenta escolhida — caso contrário a operação é bloqueada com um aviso claro.

## Gerenciar Provedores

A opção **2. Gerenciar Provedores** do menu principal abre um submenu com 4 operações:

- **Listar Provedores Cadastrados** — tabela com nome, URL Anthropic, URL OpenAI e data de criação (a chave de API nunca é exibida; provedores legados com uma única `baseUrl` são migrados para ambas as colunas automaticamente).
- **Cadastrar Novo Provedor** — fluxo guiado: nome, URL base Anthropic (opcional), URL base OpenAI (opcional) e API key. Informe pelo menos uma das duas URLs.
- **Editar Provedor** — atualize nome, URL Anthropic, URL OpenAI e/ou API key de um provedor existente (Enter mantém o valor atual).
- **Remover Provedor** — exclusão permanente após confirmação por digitação do nome.

## Desenvolvimento

```bash
npm run dev        # roda via tsx sem build
npm test           # roda a suíte vitest
npm run typecheck  # checagem de tipos
```

Configuração persistida em `~/.config/ai-switch/config.json` (permissão 0600). Sobrescreva o diretório com a env var `AI_SWITCH_CONFIG_DIR` (usado pelos testes).
