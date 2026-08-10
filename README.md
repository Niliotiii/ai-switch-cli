# AI Switch CLI

CLI universal para centralizar, gerenciar e alternar entre provedores de IA e detectar os agentes de codificação instalados na máquina (Claude Code, OpenAI Codex, opencode, GitHub Copilot CLI, Antigravity).

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

Navegue pelo menu numérico para cadastrar provedores, consultar modelos, ver os agentes instalados, iniciar um agente ou rodar o Diagnóstico.

A aplicação **detecta automaticamente** quais agentes de codificação por IA estão instalados na sua máquina — Claude Code, OpenAI Codex, opencode, GitHub Copilot CLI e Antigravity — sondando o binário de cada um com `--version`.

- **Ver Agents** (menu 4) lista os 5 agentes com status `instalado`/`não instalado`, o binário sondado e, para os que faltam, a homepage de instalação.
- **Iniciar Agent** (menu 1) oferece apenas os agentes detectados como instalados. O comportamento de lançamento depende do agente:
  - **Com provedor** (Claude Code, OpenAI Codex, opencode, GitHub Copilot CLI): você seleciona um provedor cadastrado e um modelo (listado automaticamente do provedor, com fallback para entrada manual); o CLI valida que o provedor tem a URL do protocolo correspondente. A maioria recebe env vars; o opencode recebe um provedor custom no `opencode.json` (ver abaixo):
    - **Claude Code** (`ANTHROPIC_*`, flag `--model`) — roteado pela URL Anthropic do provedor.
    - **OpenAI Codex** (`OPENAI_*`, sem flag de modelo) — roteado pela URL OpenAI; o modelo vem do `~/.codex/config.toml`.
    - **opencode** (config file, flag `-m ai-switch-<provedor>/<modelo>`) — o opencode ignora `OPENAI_BASE_URL` (seu provedor OpenAI embutido é fixo em `api.openai.com`), então o ai-switch escreve/sincroniza um provedor custom `ai-switch-<nome-do-provedor>` em `~/.config/opencode/opencode.json` (`npm: @ai-sdk/openai-compatible`, com a `baseURL` + `apiKey` do provedor e o modelo selecionado) e lança com `-m ai-switch-<provedor>/<modelo>`. A entrada é idempotente (sobrescreve só a chave `ai-switch-*`, preservando o `$schema` e os outros provedores). **Nota:** a `apiKey` do provedor fica em texto plano nesse arquivo (postura padrão do opencode, igual à entrada CrofAI que já existe); o ai-switch nunca exibe a chave.
    - **GitHub Copilot CLI** (`COPILOT_PROVIDER_*` + `COPILOT_MODEL` no env) — roteado pela URL OpenAI; o modelo vai em `COPILOT_MODEL` (BYOK do Copilot), sem flag de args.
  - **Self-contained** (Antigravity): gerencia a própria autenticação (orquestração do Google) e é lançado diretamente, sem provedor nem modelo.

| Agente             | Binário       | Auth                                      | Homepage                              |
| ------------------ | ------------- | ----------------------------------------- | ------------------------------------- |
| Claude Code        | `claude`      | env-inject (Anthropic)                    | https://claude.ai/claude-code         |
| OpenAI Codex       | `codex`       | env-inject (OpenAI)                       | https://github.com/openai/codex       |
| opencode           | `opencode`    | config-file (`opencode.json`)             | https://opencode.ai                   |
| GitHub Copilot CLI | `copilot`     | env-inject (OpenAI, `COPILOT_PROVIDER_*`) | https://github.com/github/copilot-cli |
| Antigravity        | `antigravity` | self-contained                            | https://antigravity.google            |

Cada provedor cadastrado pode ter duas URLs base: uma para o **protocolo Anthropic** e uma para o **protocolo OpenAI**. Informe pelo menos uma delas ao cadastrar. Ao iniciar um agente env-inject, o provedor precisa ter a URL do protocolo correspondente — caso contrário a operação é bloqueada com um aviso claro.

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
