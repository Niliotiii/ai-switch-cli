import { describe, expect, it } from "vitest";
import type { ContextHandoff, ContextPack } from "../../src/types.js";

function pack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    id: "ctx-1",
    name: "ai-switch-cli",
    projectPath: "/repos/ai-switch-cli",
    injectionEnabled: true,
    sections: { architecture: "", patterns: "", goal: "", decisions: [] },
    handoffs: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function handoff(n: number, overrides: Partial<ContextHandoff> = {}): ContextHandoff {
  return {
    at: `2026-08-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    agentId: "claude-code",
    providerName: "crofai",
    model: "claude-sonnet-5",
    // Zero-padded para nenhum resumo ser prefixo de outro ("sessão-1" não pode casar dentro de
    // "sessão-11"), senão os asserts de "não contém" dão falso-negativo.
    summary: `sessão-${String(n).padStart(2, "0")}`,
    ...overrides,
  };
}

describe("renderContextMarkdown", () => {
  it("delimita a saída com os marcadores, na ordem certa", async () => {
    const { renderContextMarkdown, START_MARKER, END_MARKER } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack());
    expect(out).toContain(START_MARKER);
    expect(out).toContain(END_MARKER);
    expect(out.indexOf(START_MARKER)).toBeLessThan(out.indexOf(END_MARKER));
  });

  it("um pack vazio ainda produz o bloco (nunca string vazia — merge no-op seria ambíguo)", async () => {
    const { renderContextMarkdown, START_MARKER } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack());
    expect(out.trim().startsWith(START_MARKER)).toBe(true);
    expect(out.length).toBeGreaterThan(START_MARKER.length);
  });

  it("omite seções vazias em vez de imprimir cabeçalho sem conteúdo", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack({ sections: { architecture: "CLI em camadas", patterns: "", goal: "", decisions: [] } }));
    expect(out).toContain("CLI em camadas");
    expect(out).toContain("### Arquitetura");
    expect(out).not.toContain("### Padrões da equipe");
    expect(out).not.toContain("### Decisões já tomadas");
    expect(out).not.toContain("### Problema atual");
    expect(out).not.toContain("### Histórico entre modelos");
  });

  it("renderiza as quatro seções quando preenchidas", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(
      pack({
        sections: {
          architecture: "catálogo declarativo de agentes",
          patterns: "TDD com vitest, core UI-free",
          goal: "injetar contexto entre provedores",
          decisions: ["seams injetáveis para teste", "merge por marcadores"],
        },
      }),
    );
    expect(out).toContain("### Arquitetura");
    expect(out).toContain("catálogo declarativo de agentes");
    expect(out).toContain("### Padrões da equipe");
    expect(out).toContain("TDD com vitest, core UI-free");
    expect(out).toContain("### Decisões já tomadas");
    expect(out).toContain("- seams injetáveis para teste");
    expect(out).toContain("- merge por marcadores");
    expect(out).toContain("### Problema atual");
    expect(out).toContain("injetar contexto entre provedores");
  });

  it("renderiza só os MAX_HANDOFFS mais recentes, do mais antigo para o mais novo", async () => {
    const { renderContextMarkdown, MAX_HANDOFFS } = await import("../../src/context/render.js");
    const handoffs = Array.from({ length: MAX_HANDOFFS + 4 }, (_, i) => handoff(i + 1));
    const out = renderContextMarkdown(pack({ handoffs }));

    expect(out).not.toContain("sessão-01");
    expect(out).not.toContain("sessão-04");
    const first = `sessão-${String(handoffs.length - MAX_HANDOFFS + 1).padStart(2, "0")}`;
    const last = `sessão-${String(handoffs.length).padStart(2, "0")}`;
    expect(out).toContain(first);
    expect(out).toContain(last);
    expect(out.indexOf(first)).toBeLessThan(out.indexOf(last));
  });

  it("cada handoff mostra data, agente, provedor e modelo — a coerência entre modelos vem daqui", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(
      pack({ handoffs: [handoff(11, { agentId: "opencode", providerName: "openrouter", model: "gpt-4o", summary: "extraímos o catálogo" })] }),
    );
    expect(out).toContain("2026-08-11");
    expect(out).toContain("opencode");
    expect(out).toContain("openrouter");
    expect(out).toContain("gpt-4o");
    expect(out).toContain("extraímos o catálogo");
  });

  it("trunca resumo acima de MAX_SUMMARY_CHARS", async () => {
    const { renderContextMarkdown, MAX_SUMMARY_CHARS } = await import("../../src/context/render.js");
    const long = "x".repeat(MAX_SUMMARY_CHARS + 200);
    const out = renderContextMarkdown(pack({ handoffs: [handoff(1, { summary: long })] }));
    expect(out).not.toContain(long);
    expect(out).toContain("…");
    expect(out).toContain("x".repeat(MAX_SUMMARY_CHARS));
  });

  it("achata resumo multi-linha para não quebrar o item de lista do markdown", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack({ handoffs: [handoff(1, { summary: "linha um\nlinha dois" })] }));
    expect(out).toContain("linha um linha dois");
  });

  it("renderiza só as últimas MAX_DECISIONS decisões", async () => {
    const { renderContextMarkdown, MAX_DECISIONS } = await import("../../src/context/render.js");
    const decisions = Array.from({ length: MAX_DECISIONS + 5 }, (_, i) => `decisão ${i + 1}`);
    const out = renderContextMarkdown(pack({ sections: { architecture: "", patterns: "", goal: "", decisions } }));
    expect(out).not.toContain("decisão 1\n");
    expect(out).toContain(`decisão ${decisions.length}`);
    expect(out.match(/^- decisão/gm)!.length).toBe(MAX_DECISIONS);
  });

  it("é puro: mesma entrada, saída idêntica (sem Date.now, sem fs)", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const p = pack({ sections: { architecture: "a", patterns: "b", goal: "c", decisions: ["d"] }, handoffs: [handoff(1)] });
    expect(renderContextMarkdown(p)).toBe(renderContextMarkdown(p));
  });

  it("avisa que o bloco é gerado e será sobrescrito", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack());
    expect(out.toLowerCase()).toContain("ai-switch");
    expect(out.toLowerCase()).toMatch(/sobrescrit/);
  });

  it("handoff com `at` inválido não estoura nem imprime 'Invalid Date'", async () => {
    const { renderContextMarkdown } = await import("../../src/context/render.js");
    const out = renderContextMarkdown(pack({ handoffs: [handoff(1, { at: "nao-e-data" })] }));
    expect(out).not.toContain("Invalid Date");
    expect(out).toContain("sessão-01");
  });
});
