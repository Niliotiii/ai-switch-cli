import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ContextHandoff, ContextPack, ContextSections } from "../types.js";
import { getContextsDir, getProjectDir } from "../config/paths.js";

/** Nome de arquivo derivado do projeto: `<slug>-<hash8>.json`. O slug é só legibilidade (dá para
 *  saber de qual repo é olhando o diretório); o hash do path absoluto é o que garante unicidade —
 *  dois clientes com um `api/` cada não podem compartilhar contexto. */
export function contextFileFor(projectPath: string): string {
  const absolute = path.resolve(projectPath);
  const slug =
    path.basename(absolute).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
  const hash = createHash("sha256").update(absolute).digest("hex").slice(0, 8);
  return path.join(getContextsDir(), `${slug}-${hash}.json`);
}

function emptySections(): ContextSections {
  return { architecture: "", patterns: "", goal: "", decisions: [] };
}

/** Normaliza um pack lido do disco. Arquivos escritos por versões anteriores (ou editados à mão)
 *  podem não ter todos os campos; preencher aqui evita `undefined` vazando para o renderizador. */
function normalize(raw: Partial<ContextPack>): ContextPack {
  const sections = raw.sections ?? emptySections();
  return {
    id: raw.id!,
    name: raw.name ?? "",
    projectPath: raw.projectPath ?? "",
    injectionEnabled: raw.injectionEnabled === true,
    sections: {
      architecture: sections.architecture ?? "",
      patterns: sections.patterns ?? "",
      goal: sections.goal ?? "",
      decisions: sections.decisions ?? [],
    },
    handoffs: raw.handoffs ?? [],
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/** Writes via a temp file + rename in the same directory instead of writing `file` directly.
 *  `rename()` is atomic on POSIX within a filesystem, so a crash or power loss mid-write leaves
 *  either the old content or the new one, never a truncated/corrupt JSON file — which otherwise
 *  `readPackStrict` would have no way to recover from except telling the user to fix it by hand. */
function writePack(file: string, pack: ContextPack): void {
  fs.mkdirSync(getContextsDir(), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${randomUUID()}`;
  fs.writeFileSync(tmp, JSON.stringify(pack, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

/** Lê um pack exigindo que ele seja válido. Usado nos caminhos de escrita: se o JSON está corrompido,
 *  dá throw com o path para o usuário corrigir à mão — sobrescrever seria destruir o contexto que
 *  ele passou tempo escrevendo (mesma postura de syncOpencodeProvider). */
function readPackStrict(file: string): ContextPack {
  const raw = fs.readFileSync(file, "utf-8");
  try {
    return normalize(JSON.parse(raw) as Partial<ContextPack>);
  } catch {
    throw new Error(`Não foi possível ler ${file} — JSON inválido. Corrija o arquivo manualmente.`);
  }
}

/** Lê um pack tolerando corrupção (retorna null). Usado na listagem, que é best-effort: um arquivo
 *  ruim não pode derrubar o menu inteiro — mesma política do models-cache. */
function readPackLenient(file: string): ContextPack | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<ContextPack>;
    if (!parsed || typeof parsed !== "object" || !parsed.id) return null;
    return normalize(parsed);
  } catch {
    return null;
  }
}

export function listContextPacks(): ContextPack[] {
  const dir = getContextsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readPackLenient(path.join(dir, f)))
    .filter((p): p is ContextPack => p !== null);
}

export function getContextPackForProject(projectPath: string = getProjectDir()): ContextPack | null {
  const file = contextFileFor(projectPath);
  if (!fs.existsSync(file)) return null;
  return readPackLenient(file);
}

/** Localiza o arquivo de um pack pelo id. O caminho canônico é o hash do projectPath, mas o id é o
 *  que a UI carrega entre prompts — então varremos o diretório. Poucos arquivos, custo irrelevante. */
function fileForId(id: string): string {
  const dir = getContextsDir();
  const corrupt: string[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(dir, f);
      const pack = readPackLenient(full);
      if (pack?.id === id) return full;
      // Um arquivo corrompido não revela seu id. Ele pode ser exatamente o alvo desta escrita, então
      // guardamos como candidato: reportar "não encontrado" mandaria o usuário procurar o problema
      // errado, e adivinhar o alvo arriscaria sobrescrever o contexto que ele escreveu à mão.
      if (pack === null) corrupt.push(full);
    }
  }
  if (corrupt.length > 0) {
    throw new Error(
      `Context pack com id "${id}" não encontrado. Estes arquivos de contexto estão com JSON inválido ` +
        `e podem ser o alvo — corrija-os manualmente: ${corrupt.join(", ")}`,
    );
  }
  throw new Error(`Context pack com id "${id}" não encontrado`);
}

export function createContextPack(input: { name: string; projectPath?: string }): ContextPack {
  const projectPath = path.resolve(input.projectPath ?? getProjectDir());
  const file = contextFileFor(projectPath);
  if (fs.existsSync(file)) {
    throw new Error(`O projeto "${projectPath}" já possui um contexto cadastrado`);
  }
  const now = new Date().toISOString();
  const pack: ContextPack = {
    id: randomUUID(),
    name: input.name,
    projectPath,
    injectionEnabled: false, // consentimento explícito: injetar altera arquivos versionados
    sections: emptySections(),
    handoffs: [],
    createdAt: now,
    updatedAt: now,
  };
  writePack(file, pack);
  return pack;
}

export function updateContextPack(
  id: string,
  changes: { name?: string; injectionEnabled?: boolean; sections?: Partial<ContextSections> },
): ContextPack {
  const file = fileForId(id);
  const current = readPackStrict(file);
  const updated: ContextPack = {
    ...current,
    name: changes.name ?? current.name,
    injectionEnabled: changes.injectionEnabled ?? current.injectionEnabled,
    // Merge parcial: editar "problema atual" não pode apagar a arquitetura que o usuário descreveu.
    sections: { ...current.sections, ...changes.sections },
    updatedAt: new Date().toISOString(),
  };
  writePack(file, updated);
  return updated;
}

export function appendHandoff(id: string, handoff: Omit<ContextHandoff, "at">): ContextPack {
  const file = fileForId(id);
  const current = readPackStrict(file);
  const updated: ContextPack = {
    ...current,
    handoffs: [...current.handoffs, { at: new Date().toISOString(), ...handoff }],
    updatedAt: new Date().toISOString(),
  };
  writePack(file, updated);
  return updated;
}

export function deleteContextPack(id: string): ContextPack {
  const file = fileForId(id);
  const pack = readPackStrict(file);
  fs.rmSync(file, { force: true });
  return pack;
}
