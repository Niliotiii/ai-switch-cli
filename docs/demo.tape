# VHS tape — grava a execução real do AI Switch CLI para o docs/demo.gif
# Requer: vhs (brew install vhs), build atualizado em dist/ (npm run build)
# Roda com um AI_SWITCH_CONFIG_DIR isolado (pré-populado com um provedor de demo, ver
# docs/demo-assets/seed-config.json) e um `claude` FALSO (docs/demo-assets/bin/claude) na
# frente do $PATH, para que o lançamento final não dispare uma sessão real nem gaste tokens —
# só simula a tela de abertura. Roteiro enxuto (~10-12s) para caber no limite de duração de
# GIF do LinkedIn (que rejeita GIFs "muito longos" independente do tamanho do arquivo).
#
# Rodar:
#   mkdir -p /tmp/ai-switch-demo-config
#   cp docs/demo-assets/seed-config.json /tmp/ai-switch-demo-config/config.json
#   rm -f /tmp/ai-switch-demo-config/models-cache.json
#   AI_SWITCH_CONFIG_DIR=/tmp/ai-switch-demo-config PATH="$PWD/docs/demo-assets/bin:$PATH" vhs docs/demo.tape

Output docs/demo.gif

Require node

Set Shell "zsh"
Set FontSize 18
Set Width 900
Set Height 560
Set Theme "Dracula"
Set Padding 20
Set WindowBar Colorful
Set TypingSpeed 40ms
Set Framerate 20
Set PlaybackSpeed 1.3

Hide
Type "clear"
Enter
Sleep 300ms
Show

Type "node bin/ai-switch.mjs"
Enter
Sleep 900ms

# ── 1. Iniciar Agent (provedor já cadastrado via seed-config.json) ──
Enter
Sleep 700ms

# Escolhe Claude Code
Enter
Sleep 600ms

# "Iniciar Claude Code sem pedir aprovação?" → mantém default (não)
Enter
Sleep 500ms

# Escolhe o provedor pré-cadastrado → dispara a descoberta automática de modelos (rede real)
Enter
Sleep 1.8s

# Lista de modelos carregou de verdade — confirma a primeira opção
Enter
Sleep 500ms

# launchAgent roda de verdade, mas o binário `claude` no PATH é o fake de demo — imprime a
# tela de abertura simulada e sai sozinho, sem nenhuma chamada real de API.
Sleep 2.5s
