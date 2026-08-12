# AI Switch CLI

Cadastre provedores de IA uma vez e dispare qualquer agente de codificação instalado na máquina já apontado para o provedor certo. Detecta automaticamente **Claude Code**, **OpenAI Codex**, **opencode** e **GitHub Copilot CLI**.

<p align="center">
  <img src="./docs/demo.svg" alt="Demonstração animada do AI Switch CLI" width="720" />
</p>

## Instalação

```bash
npm install -g ai-switch-cli
ai-switch
```

Ou rode uma vez sem instalar:

```bash
npx ai-switch-cli
```

Requer Node.js >= 18.

## Como funciona

1. **Cadastre um provedor** (menu *Gerenciar Provedores*) com nome, API key e ao menos uma URL base — Anthropic e/ou OpenAI.
2. **Inicie um agente** (menu *Iniciar Agent*). O CLI lista só os agentes instalados, você escolhe provedor e modelo, e ele dispara o agente com as credenciais certas.

O menu é numérico e interativo (`@inquirer/prompts`).

## Agentes suportados

| Agente | Binário | Como recebe o provedor | Homepage |
| --- | --- | --- | --- |
| Claude Code | `claude` | env vars `ANTHROPIC_*` + `--model` | https://claude.ai/claude-code |
| OpenAI Codex | `codex` | env vars `OPENAI_*` (modelo do `~/.codex/config.toml`) | https://github.com/openai/codex |
| opencode | `opencode` | provedor custom em `opencode.json` + `-m ai-switch-<p>/<m>` | https://opencode.ai |
| GitHub Copilot CLI | `copilot` | env vars `COPILOT_PROVIDER_*` + `COPILOT_MODEL` | https://github.com/github/copilot-cli |

- **Claude Code / Codex / Copilot** recebem env vars do provedor selecionado.
- **opencode** ignora `OPENAI_BASE_URL`, então o CLI escreve um provedor `ai-switch-<nome>` em `~/.config/opencode/opencode.json` (`@ai-sdk/openai-compatible`) e o lança com `-m ai-switch-<nome>/<modelo>`. A escrita é idempotente — sobrescreve só a chave `ai-switch-*` e preserva o resto do arquivo.

O modelo é escolhido a partir da lista do provedor (`GET <url>/models`), com fallback para entrada manual. Exceto Codex, que lê o modelo do próprio `~/.codex/config.toml`.

> **Segurança:** o `apiKey` nunca é exibido pelo CLI. Ao usar opencode, a chave do provedor fica em texto plano no `opencode.json` — mesma postura do opencode e dos provedores que você já configura lá (ex.: CrofAI).

## Provedores

Cada provedor tem **duas URLs base opcionais** (Anthropic e OpenAI); informe ao menos uma. Ao iniciar um agente, o CLI valida que o provedor tem a URL do protocolo exigido por aquele agente e bloqueia com aviso claro se faltar.

O submenu **Gerenciar Provedores** oferece: listar (sem expor a API key), cadastrar, editar (Enter mantém o valor atual) e remover (confirmação por digitação do nome).

## Contexto entre provedores

Trocar de modelo/provedor não deveria significar redigitar arquitetura, padrões da equipe, decisões já tomadas e o problema atual toda vez. O submenu **Contexto do Projeto** guarda isso uma vez, por projeto (ligado ao diretório onde o `ai-switch` é executado), e injeta um bloco Markdown gerado no arquivo de instruções que cada agente já lê nativamente ao iniciar:

| Agente | Arquivo injetado |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| OpenAI Codex | `AGENTS.md` |
| opencode | `AGENTS.md` |
| GitHub Copilot CLI | `.github/copilot-instructions.md` |

Como funciona:

- **Opt-in explícito.** Criar um contexto não injeta nada — é preciso ativar a injeção no submenu (opção "Ativar injeção"), que lista os arquivos exatos antes de confirmar. Sem essa ativação, nada é escrito no seu repositório.
- **Merge idempotente.** O bloco é delimitado por marcadores (`<!-- ai-switch:context:start/end -->`); só essa região é sobrescrita a cada launch — o resto do arquivo (suas próprias instruções manuais) nunca é tocado. Rodar de novo não duplica o bloco.
- **Histórico entre modelos.** Ao encerrar um agente com sucesso, o CLI pergunta um resumo de uma linha (Enter pula). Esse resumo — junto com agente, provedor e modelo usados — entra no "Histórico entre modelos" do bloco, para que a **próxima** sessão, possivelmente em outro provedor, continue de onde a anterior parou em vez de você repetir tudo.
- **Teto de tamanho.** Só as 8 sessões mais recentes e as 30 decisões mais recentes são renderizadas, e cada resumo é truncado em 500 caracteres — o objetivo é reduzir retrabalho e tokens, não recriar o mesmo desperdício por outro caminho.

> **Segurança:** o pack de contexto nunca guarda a `apiKey` — o histórico identifica o provedor pelo nome, não pela credencial. O bloco injetado é só texto que você escreveu (arquitetura, padrões, decisões, resumos); revise antes de ativar a injeção se o repositório for compartilhado.

## Desenvolvimento

Para contribuir ou rodar a partir do código-fonte:

```bash
git clone <repo> && cd ai-switch-cli
npm install
npm run dev        # roda via tsx, sem build
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # gera dist/
```

Configuração persistida em `~/.config/ai-switch/config.json` (permissão `0600`). Sobrescreva o diretório com a env var `AI_SWITCH_CONFIG_DIR` (usado pelos testes).
