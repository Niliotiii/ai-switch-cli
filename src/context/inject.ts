import { randomUUID } from "node:crypto";
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
// (merge de git malfeito, ou uma execução anterior de outra ferramenta que duplicou o bloco). SÓ é
// seguro usar isto depois de `hasWellFormedMarkerPairing` confirmar a alternância S,E,S,E,... — veja
// o comentário lá para o porquê (casar "START com o END mais próximo" engole um START intermediário
// silenciosamente quando há mais STARTs que ENDs).
const BLOCK_RE = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`, "g");
const MARKER_RE = new RegExp(`${escapeRegExp(START_MARKER)}|${escapeRegExp(END_MARKER)}`, "g");

/**
 * Verifica que START_MARKER e END_MARKER aparecem em estrita alternância S,E,S,E,...,S,E — nunca
 * dois STARTs seguidos, nunca um END antes do primeiro START, nunca um START sobrando no final.
 *
 * Isso é o que torna seguro usar `BLOCK_RE` (lazy, casa cada START com o END mais próximo à frente)
 * no replace() de `mergeContextBlock`: sem essa validação prévia, um arquivo com DOIS STARTs antes
 * de um único END — `S1 ... S2 ... E` — faz o regex casar de S1 até esse único E, "engolindo" S2 e
 * todo o conteúdo do usuário entre S1 e S2 como se fosse conteúdo comum do bloco. O replace() então
 * apaga esse trecho junto com o bloco antigo, sem throw, sem aviso — perda silenciosa de dados, não
 * apenas um bloco não substituído. Validar a alternância primeiro garante que, quando prosseguimos,
 * "o END mais próximo à frente de um START" É de fato o par correto daquele START.
 */
function hasWellFormedMarkerPairing(text: string): boolean {
  let expectingStart = true;
  for (const match of text.matchAll(MARKER_RE)) {
    const isStart = match[0] === START_MARKER;
    if (isStart !== expectingStart) return false;
    expectingStart = !expectingStart;
  }
  return expectingStart; // false se um START ficou sem END correspondente no final
}

/**
 * Funde `block` (a saída de `renderContextMarkdown`) em `existing` (o conteúdo atual do arquivo, ou
 * `null` se ele não existe). Pura — nenhuma leitura/escrita de disco aqui, para que a lógica de merge
 * seja testável sem tocar o filesystem.
 *
 * - Sem arquivo: o bloco é o conteúdo inteiro.
 * - Arquivo sem marcadores: o bloco é prependado — o contexto do ai-switch vem primeiro, e a prosa
 *   do usuário nunca é reescrita ou movida.
 * - Arquivo com os dois marcadores em pares bem formados: substitui só a região do primeiro par
 *   (idempotente). Se houver mais de um par, o primeiro é substituído e os demais são removidos —
 *   auto-cura de um merge de git que duplicou o bloco.
 * - Marcadores ausentes, truncados ou fora de ordem (edição manual corrompeu o arquivo, ou a prosa
 *   do usuário coincidentemente contém o texto literal de um marcador): dá throw. Adivinhar qual
 *   START pertence a qual END arriscaria apagar conteúdo do usuário — pedir correção manual é o
 *   único resultado seguro quando a alternância não é inequívoca.
 */
export function mergeContextBlock(existing: string | null, block: string): string {
  if (existing === null) return `${block}\n`;

  if (!hasWellFormedMarkerPairing(existing)) {
    throw new Error(
      `Marcadores do ai-switch ("${START_MARKER}" / "${END_MARKER}") ausentes, truncados ou fora de ` +
        `ordem — o arquivo parece ter sido editado manualmente. Corrija a região do ai-switch manualmente antes de continuar.`,
    );
  }
  const hasStart = existing.includes(START_MARKER);
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

  // `AgentDefinition.contextFiles` is documented (src/types.ts) as "relative, never escaping the
  // project root" but nothing enforced that — every entry today is a hardcoded literal in the
  // catalog, so this isn't reachable yet, but it's a one-line guard against a future 5th agent (or
  // an editable catalog) smuggling a `../../etc/whatever` path and writing outside the project.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  for (const file of targets) {
    if (!file.startsWith(rootWithSep)) {
      throw new Error(`contextFiles inválido: "${file}" escapa da raiz do projeto "${root}"`);
    }
  }

  for (const file of targets) {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // A symlink at `file` pointing outside the project root would make readFileSync below read
    // whatever the link targets (e.g. a repo shipped with `CLAUDE.md -> ~/.ssh/id_rsa`), and the
    // merge would copy that content into the new CLAUDE.md written back over the link. rename()
    // itself never follows the link (it replaces the link's own directory entry), so the linked
    // file is never overwritten — but its content still gets read and re-embedded into a file
    // inside the project, which is the actual leak. Refuse before any read happens.
    let linkStat: fs.Stats | null = null;
    try {
      linkStat = fs.lstatSync(file);
    } catch {
      linkStat = null; // doesn't exist yet — nothing to check
    }
    if (linkStat?.isSymbolicLink()) {
      const real = fs.realpathSync(file);
      const realWithSep = real.endsWith(path.sep) ? real : real + path.sep;
      if (real !== root && !realWithSep.startsWith(rootWithSep)) {
        throw new Error(
          `"${file}" é um symlink apontando para fora da raiz do projeto ("${real}") — recusando ler ou sobrescrever por segurança.`,
        );
      }
    }

    const fileExists = fs.existsSync(file);
    const existing = fileExists ? fs.readFileSync(file, "utf-8") : null;
    const merged = mergeContextBlock(existing, block);
    // Temp file + rename instead of a direct write — this is the user's own CLAUDE.md/AGENTS.md
    // (possibly hand-edited, possibly tracked in git); a crash mid-write must never leave it
    // truncated. rename() is atomic on POSIX within the same directory/filesystem.
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.ai-switch-tmp-${randomUUID()}`);
    try {
      // Explicit mode instead of leaving it to the process umask: a brand-new CLAUDE.md/AGENTS.md
      // should land at the conventional 0644 (readable, not writable, by group/other) regardless of
      // what umask the CLI happens to run under, rather than silently inheriting whatever that is.
      fs.writeFileSync(tmp, merged, { encoding: "utf-8", mode: 0o644 });
      // rename() replaces the destination inode outright, so the file would otherwise inherit the
      // temp file's default creation mode instead of whatever the user had (e.g. a chmod'd
      // CLAUDE.md) — a plain writeFileSync to an existing file never touches its mode, so this
      // preserves that. Best-effort: an external process could delete `file` between the
      // existsSync check above and this statSync (unlikely for a single-user local CLI, but cheap
      // to not crash over) — fall back to no mode-preservation rather than letting ENOENT abort
      // the whole injection.
      if (fileExists) {
        try {
          fs.chmodSync(tmp, fs.statSync(file).mode);
        } catch {
          /* file vanished after all — proceed without preserving its mode */
        }
      }
      fs.renameSync(tmp, file);
    } catch (error) {
      // Don't leave the temp file behind on any failure in this sequence.
      fs.rmSync(tmp, { force: true });
      throw error;
    }
  }
  return targets;
}
