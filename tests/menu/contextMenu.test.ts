import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextPack } from "../../src/types.js";

vi.mock("../../src/context/store.js", () => ({
  getContextPackForProject: vi.fn(),
  createContextPack: vi.fn(),
  updateContextPack: vi.fn(),
  appendHandoff: vi.fn(),
  deleteContextPack: vi.fn(),
}));
vi.mock("../../src/config/paths.js", () => ({ getProjectDir: vi.fn(() => "/repos/p") }));

function pack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    id: "ctx-1",
    name: "p",
    projectPath: "/repos/p",
    injectionEnabled: false,
    sections: { architecture: "", patterns: "", goal: "", decisions: [] },
    handoffs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextMenuFlow", () => {
  it("sem pack para o projeto, oferece criar um; ao confirmar, chama createContextPack", async () => {
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack: vi.fn(async () => null), // Voltar após criar — não navega mais no submenu
      promptText: vi.fn(async () => "meu-projeto"),
      promptConfirm: vi.fn(async () => true),
    }));
    const { getContextPackForProject, createContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (createContextPack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pack({ name: "meu-projeto" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(createContextPack).toHaveBeenCalledWith({ name: "meu-projeto" });
    vi.resetModules();
  });

  it("recusando a criação, não chama createContextPack e sai do submenu", async () => {
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack: vi.fn(async () => null),
      promptText: vi.fn(async () => "x"),
      promptConfirm: vi.fn(async () => false),
    }));
    const { getContextPackForProject, createContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(createContextPack).not.toHaveBeenCalled();
    vi.resetModules();
  });

  it("editar seção 'arquitetura' preserva as demais seções (merge parcial)", async () => {
    const promptChoiceWithBack = vi
      .fn()
      .mockResolvedValueOnce("edit-architecture")
      .mockResolvedValueOnce(null);
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack,
      promptText: vi.fn(async () => "novo texto de arquitetura"),
      promptConfirm: vi.fn(async () => true),
    }));
    const { getContextPackForProject, updateContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      pack({ sections: { architecture: "antiga", patterns: "TDD", goal: "g", decisions: ["d1"] } }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(updateContextPack).toHaveBeenCalledWith("ctx-1", { sections: { architecture: "novo texto de arquitetura" } });
    vi.resetModules();
  });

  it("ativar injeção lista os destinos, exige confirmação e persiste injectionEnabled: true", async () => {
    const promptChoiceWithBack = vi
      .fn()
      .mockResolvedValueOnce("toggle-injection")
      .mockResolvedValueOnce(null);
    const promptConfirm = vi.fn(async () => true);
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack,
      promptText: vi.fn(async () => ""),
      promptConfirm,
    }));
    const { getContextPackForProject, updateContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pack({ injectionEnabled: false }));
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(promptConfirm).toHaveBeenCalled();
    expect(updateContextPack).toHaveBeenCalledWith("ctx-1", { injectionEnabled: true });
    vi.resetModules();
  });

  it("Voltar em cada nível não escreve nada", async () => {
    const promptChoiceWithBack = vi.fn().mockResolvedValueOnce(null);
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack,
      promptText: vi.fn(),
      promptConfirm: vi.fn(),
    }));
    const { getContextPackForProject, updateContextPack, createContextPack, appendHandoff, deleteContextPack } = await import(
      "../../src/context/store.js"
    );
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pack());
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(updateContextPack).not.toHaveBeenCalled();
    expect(createContextPack).not.toHaveBeenCalled();
    expect(appendHandoff).not.toHaveBeenCalled();
    expect(deleteContextPack).not.toHaveBeenCalled();
    vi.resetModules();
  });

  it("remover contexto exige digitar o nome exato para confirmar", async () => {
    const promptChoiceWithBack = vi
      .fn()
      .mockResolvedValueOnce("delete")
      .mockResolvedValueOnce(null);
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoiceWithBack,
      promptText: vi.fn(async () => "remover meu-projeto"),
      promptConfirm: vi.fn(),
    }));
    const { getContextPackForProject, deleteContextPack } = await import("../../src/context/store.js");
    (getContextPackForProject as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pack({ name: "meu-projeto" }));
    (deleteContextPack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pack({ name: "meu-projeto" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { contextMenuFlow } = await import("../../src/menu/contextMenu.js");
    await contextMenuFlow();
    expect(deleteContextPack).toHaveBeenCalledWith("ctx-1");
    vi.resetModules();
  });
});
