import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ai-switch-ctx-"));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.AI_SWITCH_CONFIG_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("context store", () => {
  it("createContextPack persiste e getContextPackForProject relê pelo projectPath", async () => {
    const { createContextPack, getContextPackForProject } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "ai-switch-cli", projectPath: "/repos/ai-switch-cli" });
    expect(created.name).toBe("ai-switch-cli");
    expect(created.projectPath).toBe("/repos/ai-switch-cli");

    const found = getContextPackForProject("/repos/ai-switch-cli");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("getContextPackForProject retorna null quando o projeto não tem contexto", async () => {
    const { getContextPackForProject } = await import("../../src/context/store.js");
    expect(getContextPackForProject("/repos/sem-contexto")).toBeNull();
  });

  it("injectionEnabled nasce false — escrever no repo do usuário nunca é default", async () => {
    const { createContextPack } = await import("../../src/context/store.js");
    expect(createContextPack({ name: "p", projectPath: "/repos/p" }).injectionEnabled).toBe(false);
  });

  it("grava com permissão 0600 em um dir 0700", async () => {
    const { createContextPack } = await import("../../src/context/store.js");
    const { getContextsDir } = await import("../../src/config/paths.js");
    const { contextFileFor } = await import("../../src/context/store.js");
    createContextPack({ name: "p", projectPath: "/repos/p" });
    const file = contextFileFor("/repos/p");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(getContextsDir()).mode & 0o777).toBe(0o700);
  });

  it("dois projetos com o mesmo nome de pasta não colidem (hash do path no nome do arquivo)", async () => {
    const { createContextPack, getContextPackForProject } = await import("../../src/context/store.js");
    const a = createContextPack({ name: "api", projectPath: "/repos/cliente-a/api" });
    const b = createContextPack({ name: "api", projectPath: "/repos/cliente-b/api" });
    expect(a.id).not.toBe(b.id);
    expect(getContextPackForProject("/repos/cliente-a/api")!.id).toBe(a.id);
    expect(getContextPackForProject("/repos/cliente-b/api")!.id).toBe(b.id);
  });

  it("resolve o projectPath para absoluto e usa getProjectDir() como default", async () => {
    process.env.AI_SWITCH_PROJECT_DIR = "/repos/default-proj";
    try {
      const { createContextPack, getContextPackForProject } = await import("../../src/context/store.js");
      const created = createContextPack({ name: "sem-path" });
      expect(created.projectPath).toBe("/repos/default-proj");
      expect(getContextPackForProject()!.id).toBe(created.id);
    } finally {
      delete process.env.AI_SWITCH_PROJECT_DIR;
    }
  });

  it("createContextPack dá throw quando o projeto já tem um contexto (evita sobrescrita silenciosa)", async () => {
    const { createContextPack } = await import("../../src/context/store.js");
    createContextPack({ name: "p", projectPath: "/repos/p" });
    expect(() => createContextPack({ name: "outro", projectPath: "/repos/p" })).toThrow(/já (possui|tem)/i);
  });

  it("updateContextPack faz merge parcial de sections preservando as demais e bumpa updatedAt", async () => {
    const { createContextPack, updateContextPack, getContextPackForProject } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "p", projectPath: "/repos/p" });
    updateContextPack(created.id, { sections: { architecture: "CLI em camadas", decisions: ["catálogo declarativo"] } });
    const afterFirst = getContextPackForProject("/repos/p")!;

    const updated = updateContextPack(created.id, { sections: { goal: "injetar contexto entre provedores" } });
    expect(updated.sections.architecture).toBe("CLI em camadas");
    expect(updated.sections.decisions).toEqual(["catálogo declarativo"]);
    expect(updated.sections.goal).toBe("injetar contexto entre provedores");
    expect(updated.sections.patterns).toBe("");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(afterFirst.updatedAt));
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("updateContextPack persiste name e injectionEnabled", async () => {
    const { createContextPack, updateContextPack, getContextPackForProject } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "p", projectPath: "/repos/p" });
    updateContextPack(created.id, { name: "novo-nome", injectionEnabled: true });
    const reread = getContextPackForProject("/repos/p")!;
    expect(reread.name).toBe("novo-nome");
    expect(reread.injectionEnabled).toBe(true);
  });

  it("appendHandoff anexa em ordem, preenche `at` em ISO e preserva os anteriores", async () => {
    const { createContextPack, appendHandoff, getContextPackForProject } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "p", projectPath: "/repos/p" });
    appendHandoff(created.id, { agentId: "claude-code", providerName: "crofai", model: "claude-sonnet-5", summary: "primeiro" });
    const after = appendHandoff(created.id, { agentId: "opencode", providerName: "openrouter", model: "gpt-4o", summary: "segundo" });

    expect(after.handoffs).toHaveLength(2);
    expect(after.handoffs.map((h) => h.summary)).toEqual(["primeiro", "segundo"]);
    expect(after.handoffs[1]!.agentId).toBe("opencode");
    expect(Number.isNaN(Date.parse(after.handoffs[0]!.at))).toBe(false);
    expect(getContextPackForProject("/repos/p")!.handoffs).toHaveLength(2);
  });

  it("listContextPacks ignora arquivos corrompidos em vez de estourar (best-effort, como o cache)", async () => {
    const { createContextPack, listContextPacks } = await import("../../src/context/store.js");
    const { getContextsDir } = await import("../../src/config/paths.js");
    createContextPack({ name: "bom", projectPath: "/repos/bom" });
    mkdirSync(getContextsDir(), { recursive: true });
    writeFileSync(path.join(getContextsDir(), "corrompido-deadbeef.json"), "{ nao json ,,,", "utf-8");

    expect(() => listContextPacks()).not.toThrow();
    expect(listContextPacks().map((p) => p.name)).toEqual(["bom"]);
  });

  it("appendHandoff em um arquivo corrompido dá throw com o path — nunca sobrescreve às cegas", async () => {
    const { createContextPack, appendHandoff, contextFileFor } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "p", projectPath: "/repos/p" });
    const file = contextFileFor("/repos/p");
    writeFileSync(file, "{ corrompido ,,,", "utf-8");

    expect(() => appendHandoff(created.id, { agentId: "codex", providerName: "x", model: "y", summary: "z" })).toThrow(file);
    // O conteúdo corrompido continua lá para o usuário corrigir à mão.
    expect(readFileSync(file, "utf-8")).toContain("corrompido");
  });

  it("updateContextPack e appendHandoff dão throw em id inexistente", async () => {
    const { updateContextPack, appendHandoff } = await import("../../src/context/store.js");
    expect(() => updateContextPack("nao-existe", { name: "x" })).toThrow(/not found|não encontrado/i);
    expect(() => appendHandoff("nao-existe", { agentId: "codex", providerName: "x", model: "y", summary: "z" })).toThrow(/not found|não encontrado/i);
  });

  it("deleteContextPack remove o arquivo e retorna o pack removido", async () => {
    const { createContextPack, deleteContextPack, getContextPackForProject, contextFileFor } = await import("../../src/context/store.js");
    const created = createContextPack({ name: "p", projectPath: "/repos/p" });
    const removed = deleteContextPack(created.id);
    expect(removed.id).toBe(created.id);
    expect(existsSync(contextFileFor("/repos/p"))).toBe(false);
    expect(getContextPackForProject("/repos/p")).toBeNull();
  });

  it("listContextPacks retorna [] quando o diretório nem existe", async () => {
    const { listContextPacks } = await import("../../src/context/store.js");
    expect(listContextPacks()).toEqual([]);
  });
});
