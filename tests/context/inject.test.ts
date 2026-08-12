import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDefinition, ContextPack } from "../../src/types.js";
import { END_MARKER, START_MARKER } from "../../src/context/render.js";

function pack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    id: "ctx-1",
    name: "p",
    projectPath: "/repos/p",
    injectionEnabled: true,
    sections: { architecture: "arquitetura x", patterns: "", goal: "", decisions: [] },
    handoffs: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const agentStub = (contextFiles: string[]) => ({ contextFiles }) as AgentDefinition;

describe("mergeContextBlock", () => {
  it("arquivo ausente (null) retorna o bloco terminado em newline", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const block = `${START_MARKER}\nX\n${END_MARKER}`;
    expect(mergeContextBlock(null, block)).toBe(`${block}\n`);
  });

  it("arquivo existente sem marcadores: bloco é prependado, preservando a prosa do usuário", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const block = `${START_MARKER}\nX\n${END_MARKER}`;
    const existing = "# Meu projeto\n\nAlgumas instruções manuais.\n";
    const merged = mergeContextBlock(existing, block);
    expect(merged.startsWith(block)).toBe(true);
    expect(merged).toContain(existing);
    expect(merged.indexOf(block)).toBeLessThan(merged.indexOf("Meu projeto"));
  });

  it("arquivo com os dois marcadores: substitui só a região entre eles", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const existing = `Antes\n${START_MARKER}\nVELHO\n${END_MARKER}\nDepois`;
    const merged = mergeContextBlock(existing, `${START_MARKER}\nNOVO\n${END_MARKER}`);
    expect(merged).toContain("Antes");
    expect(merged).toContain("Depois");
    expect(merged).toContain("NOVO");
    expect(merged).not.toContain("VELHO");
  });

  it("é idempotente: aplicar duas vezes o mesmo bloco dá o mesmo resultado que aplicar uma", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const block = `${START_MARKER}\nX\n${END_MARKER}`;
    const once = mergeContextBlock("# Projeto\n\nprosa", block);
    const twice = mergeContextBlock(once, block);
    expect(twice).toBe(once);
  });

  it("marcador de início sem o de fim: dá throw pedindo correção manual (nunca adivinha o fim)", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const existing = `${START_MARKER}\nsem fim aqui`;
    expect(() => mergeContextBlock(existing, `${START_MARKER}\nX\n${END_MARKER}`)).toThrow(/manual/i);
  });

  it("END aparece antes de um START sem fim: dá throw em vez de retornar o arquivo inalterado sem avisar", async () => {
    // Regressão: hasStart && hasEnd eram ambos true aqui, então o guard antigo ("start sem end")
    // não disparava; o replace() não encontrava nenhum START→END válido (o END vem ANTES do START)
    // e a função devolvia `existing` byte a byte igual — o bloco novo nunca era escrito e nenhum
    // erro avisava o usuário. injectContext reportaria o arquivo como "escrito" sem ele ter mudado.
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const existing = `foo\n${END_MARKER}\nbar\n${START_MARKER}\nsem fim aqui`;
    const block = `${START_MARKER}\nNOVO\n${END_MARKER}`;
    expect(() => mergeContextBlock(existing, block)).toThrow(/manual/i);
  });

  it("só o marcador de fim presente (sem início): dá throw em vez de prependar ao lado de um END órfão", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const existing = `prosa do usuário\n${END_MARKER}\nmais prosa`;
    const block = `${START_MARKER}\nNOVO\n${END_MARKER}`;
    expect(() => mergeContextBlock(existing, block)).toThrow(/manual/i);
  });

  it("múltiplas ocorrências do bloco: substitui a primeira e remove as demais (auto-cura de merge de git)", async () => {
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const dup = `${START_MARKER}\nA\n${END_MARKER}\nmeio\n${START_MARKER}\nB\n${END_MARKER}`;
    const merged = mergeContextBlock(dup, `${START_MARKER}\nNOVO\n${END_MARKER}`);
    expect(merged.split(START_MARKER).length - 1).toBe(1);
    expect(merged).toContain("meio");
    expect(merged).toContain("NOVO");
  });

  it("dois pares válidos seguidos de um START pendente sem fim: dá throw (o START extra não pode ficar órfão em silêncio)", async () => {
    // Sem checar o que sobra depois de remover os pares casados, esse START pendente no fim não
    // afeta o replace() dos dois pares válidos — a função processaria os dois pares normalmente e
    // deixaria o terceiro START solto no arquivo, sem nunca avisar que ele existe.
    const { mergeContextBlock } = await import("../../src/context/inject.js");
    const existing = `${START_MARKER}\nA\n${END_MARKER}\nmeio\n${START_MARKER}\nB\n${END_MARKER}\n${START_MARKER}`;
    const block = `${START_MARKER}\nNOVO\n${END_MARKER}`;
    expect(() => mergeContextBlock(existing, block)).toThrow(/manual/i);
  });
});

describe("injectContext", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ai-switch-inject-"));
    process.env.AI_SWITCH_PROJECT_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.AI_SWITCH_PROJECT_DIR;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cria o arquivo quando ele não existe", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const written = injectContext(pack(), agentStub(["CLAUDE.md"]));
    const file = path.join(tmpDir, "CLAUDE.md");
    expect(written).toEqual([file]);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf-8")).toContain("arquitetura x");
  });

  it("dá throw e não escreve nada se contextFiles tentar escapar da raiz do projeto", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    expect(() => injectContext(pack(), agentStub(["../../etc/passwd"]))).toThrow(/escapa da raiz do projeto/);
    expect(existsSync(path.join(path.dirname(tmpDir), "etc", "passwd"))).toBe(false);
  });

  it("preserva a permissão do arquivo existente através do write atômico (temp file + rename)", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const file = path.join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# Instruções manuais\n", "utf-8");
    chmodSync(file, 0o640);
    injectContext(pack(), agentStub(["CLAUDE.md"]));
    // rename() substitui o inode inteiro — sem restaurar o modo explicitamente, o arquivo herdaria
    // a permissão padrão do temp file recém-criado em vez do 0640 que o usuário escolheu.
    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it("preserva prosa preexistente do usuário", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const file = path.join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# Instruções manuais\n\nNão remover.\n", "utf-8");
    injectContext(pack(), agentStub(["CLAUDE.md"]));
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("Instruções manuais");
    expect(content).toContain("Não remover");
    expect(content).toContain("arquitetura x");
  });

  it("cria diretórios intermediários (.github/ para o copilot)", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const written = injectContext(pack(), agentStub([".github/copilot-instructions.md"]));
    const file = path.join(tmpDir, ".github", "copilot-instructions.md");
    expect(written).toEqual([file]);
    expect(existsSync(file)).toBe(true);
  });

  it("deduplica contextFiles repetidos", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const written = injectContext(pack(), agentStub(["AGENTS.md", "AGENTS.md"]));
    expect(written).toEqual([path.join(tmpDir, "AGENTS.md")]);
  });

  it("com injectionEnabled false, não escreve nada e retorna []", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    const written = injectContext(pack({ injectionEnabled: false }), agentStub(["CLAUDE.md"]));
    expect(written).toEqual([]);
    expect(existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
  });

  it("rodar duas vezes não duplica o bloco no arquivo", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    injectContext(pack(), agentStub(["CLAUDE.md"]));
    injectContext(pack(), agentStub(["CLAUDE.md"]));
    const content = readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content.split(START_MARKER).length - 1).toBe(1);
  });

  it("aplica a múltiplos destinos (ex.: codex e opencode compartilhando AGENTS.md, chamado uma vez)", async () => {
    const { injectContext } = await import("../../src/context/inject.js");
    mkdirSync(tmpDir, { recursive: true });
    const written = injectContext(pack(), agentStub(["AGENTS.md", "CLAUDE.md"]));
    expect(written.sort()).toEqual([path.join(tmpDir, "AGENTS.md"), path.join(tmpDir, "CLAUDE.md")].sort());
  });
});
