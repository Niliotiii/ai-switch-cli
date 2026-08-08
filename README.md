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

## Desenvolvimento

```bash
npm run dev        # roda via tsx sem build
npm test           # roda a suíte vitest
npm run typecheck  # checagem de tipos
```

Configuração persistida em `~/.config/ai-switch/config.json` (permissão 0600). Sobrescreva o diretório com a env var `AI_SWITCH_CONFIG_DIR` (usado pelos testes).
