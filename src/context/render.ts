import type { ContextHandoff, ContextPack } from "../types.js";

/** Marcadores que delimitam a região gerada. Tudo fora deles é do usuário e nunca é tocado — é o que
 *  torna o merge idempotente e deixa o resto do CLAUDE.md/AGENTS.md livre. */
export const START_MARKER = "<!-- ai-switch:context:start -->";
export const END_MARKER = "<!-- ai-switch:context:end -->";

/** Tetos de tamanho. Existem porque o problema que a feature resolve é gasto de token: um histórico
 *  ilimitado injetado em todo boot recriaria, por outro caminho, o desperdício que queremos eliminar.
 *  Exportados para que os testes (e o menu) raciocinem sobre os limites em vez de duplicá-los. */
export const MAX_HANDOFFS = 8;
export const MAX_DECISIONS = 30;
export const MAX_SUMMARY_CHARS = 500;

/**
 * Remove qualquer ocorrência literal dos marcadores de todo texto livre digitado pelo usuário antes
 * de ele entrar no bloco renderizado — arquitetura, padrões, decisões, resumos de handoff, nome do
 * provedor, modelo. Sem isso, um texto que cita a sintaxe do próprio marcador (ex.: alguém
 * documentando esta feature, ou copiando um trecho que menciona `<!-- ai-switch:context:end -->`)
 * criaria uma terceira ocorrência de marcador no bloco. `inject.ts` confia que todo texto no formato
 * de um marcador É um delimitador real — com uma ocorrência extra vinda do CONTEÚDO em vez da
 * ESTRUTURA, um merge futuro pode ficar com uma alternância S,E,S,E que passa a validação de
 * `hasWellFormedMarkerPairing` mas cujo pareamento real (START verdadeiro → END mais próximo) não
 * é o que parece, apagando conteúdo do usuário em silêncio. Isso garante que os dois marcadores que
 * NÓS emitimos (start/end do bloco inteiro) sejam sempre os únicos que existem na saída.
 */
function stripMarkers(text: string): string {
  return text.split(START_MARKER).join("").split(END_MARKER).join("");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Resumo cabe em um item de lista: quebras de linha viram espaço, senão o markdown do bloco
 *  se desmancha e o agente lê lixo estrutural. */
function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

/** `YYYY-MM-DD` a partir de um ISO. Um `at` inválido (arquivo editado à mão) não pode virar
 *  "Invalid Date" no contexto de um modelo — melhor omitir a data que injetar ruído. */
function formatDate(at: string): string | null {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function renderHandoff(h: ContextHandoff): string {
  const date = formatDate(h.at);
  const who = `${h.agentId} (${stripMarkers(h.providerName)} · ${stripMarkers(h.model)})`;
  const head = date ? `${date} · ${who}` : who;
  return `- ${head}: ${truncate(oneLine(stripMarkers(h.summary)), MAX_SUMMARY_CHARS)}`;
}

/**
 * Transforma um pack no bloco Markdown injetado nos arquivos de instruções dos agentes.
 *
 * Puro de propósito: sem `fs`, sem `Date.now()` — a data de cada handoff vem do próprio `at`. Isso
 * garante que renderizar duas vezes o mesmo pack dê byte a byte a mesma string, que é a premissa da
 * idempotência do merge (um launch sem novidade não deixa diff no repositório do usuário).
 *
 * Só recebe `ContextPack`, que não tem campo de credencial — é assim que a invariante "apiKey nunca
 * aparece" é garantida por tipo e não por disciplina.
 */
export function renderContextMarkdown(pack: ContextPack): string {
  const lines: string[] = [
    START_MARKER,
    "<!-- Bloco gerado pelo ai-switch. Edite via `ai-switch` → Contexto do Projeto:",
    "     alterações feitas à mão aqui dentro são sobrescritas no próximo launch. -->",
    "## Contexto do projeto (ai-switch)",
  ];

  const { architecture, patterns, goal, decisions } = pack.sections;

  if (architecture.trim()) {
    lines.push("", "### Arquitetura", stripMarkers(architecture.trim()));
  }
  if (patterns.trim()) {
    lines.push("", "### Padrões da equipe", stripMarkers(patterns.trim()));
  }
  const kept = decisions.filter((d) => d.trim()).slice(-MAX_DECISIONS);
  if (kept.length > 0) {
    lines.push("", "### Decisões já tomadas", ...kept.map((d) => `- ${oneLine(stripMarkers(d))}`));
  }
  if (goal.trim()) {
    lines.push("", "### Problema atual", stripMarkers(goal.trim()));
  }

  const handoffs = pack.handoffs.slice(-MAX_HANDOFFS);
  if (handoffs.length > 0) {
    lines.push(
      "",
      "### Histórico entre modelos",
      "<!-- Sessões anteriores deste projeto, possivelmente em outros provedores/modelos.",
      "     Continue de onde pararam; não re-derive o que já foi decidido acima. -->",
      ...handoffs.map(renderHandoff),
    );
  }

  lines.push(END_MARKER);
  return lines.join("\n");
}
