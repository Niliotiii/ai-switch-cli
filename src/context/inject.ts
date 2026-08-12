import fs from "node:fs";
import path from "node:path";
import type { AgentDefinition, ContextPack } from "../types.js";
import { getProjectDir } from "../config/paths.js";
import { END_MARKER, renderContextMarkdown, START_MARKER } from "./render.js";

/** Escapa uma string para uso literal em RegExp — os marcadores contêm `<`, `!`, `-`, que não são
 *  especiais em regex, mas tratar isso genericamente evita surpresa se os marcadores mudarem. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Global e não-guloso: casa cada ocorrência start→end mínima, mesmo com múltiplos blocos no arquivo
// (merge de git malfeito, ou uma execução anterior de outra ferramenta que duplicou o bloco).
const BLOCK_RE = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`, "g");

/**
 * Funde `block` (a saída de `renderContextMarkdown`) em `existing` (o conteúdo atual do arquivo, ou
 * `null` se ele não existe). Pura — nenhuma leitura/escrita de disco aqui, para que a lógica de merge
 * seja testável sem tocar o filesystem.
 *
 * - Sem arquivo: o bloco é o conteúdo inteiro.
 * - Arquivo sem marcadores: o bloco é prependado — o contexto do ai-switch vem primeiro, e a prosa
 *   do usuário nunca é reescrita ou movida.
 * - Arquivo com os dois marcadores: substitui só a região entre eles (idempotente). Se houver mais
 *   de uma ocorrência, a primeira é substituída e as demais removidas — auto-cura de um merge de git
 *   que duplicou o bloco.
 * - Marcador de início sem o de fim (edição manual truncou o arquivo): dá throw. Adivinhar onde a
 *   região deveria terminar arriscaria apagar conteúdo do usuário.
 */
export function mergeContextBlock(existing: string | null, block: string): string {
  if (existing === null) return `${block}\n`;

  const hasStart = existing.includes(START_MARKER);
  const hasEnd = existing.includes(END_MARKER);
  if (hasStart && !hasEnd) {
    throw new Error(
      `Encontrado "${START_MARKER}" sem o marcador de fim correspondente — o arquivo parece ter sido ` +
        `editado manualmente. Corrija a região do ai-switch manualmente antes de continuar.`,
    );
  }
  if (!hasStart) {
    return `${block}\n\n${existing}`;
  }

  let replaced = false;
  const merged = existing.replace(BLOCK_RE, () => {
    if (replaced) return ""; // ocorrências extras somem
    replaced = true;
    return block;
  });
  // Remove uma linha em branco órfã deixada por uma ocorrência extra removida.
  return merged.replace(/\n{3,}/g, "\n\n");
}

/**
 * Injeta o pack nos `contextFiles` do agente, resolvidos contra a raiz do projeto. Retorna os paths
 * efetivamente escritos.
 *
 * O guard de consentimento vive aqui — no core, não só na UI — porque este é o único ponto por onde
 * toda escrita passa; nenhum caminho do menu pode contornar `injectionEnabled === false`.
 */
export function injectContext(pack: ContextPack, agent: AgentDefinition): string[] {
  if (!pack.injectionEnabled) return [];

  const root = getProjectDir();
  const block = renderContextMarkdown(pack);
  const targets = [...new Set(agent.contextFiles)].map((f) => path.join(root, f));

  for (const file of targets) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
    fs.writeFileSync(file, mergeContextBlock(existing, block), "utf-8");
  }
  return targets;
}
