import { describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({ select: vi.fn() }));

describe("promptChoiceWithBack", () => {
  it("returns the chosen value when a normal option is selected", async () => {
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("openrouter");
    const { promptChoiceWithBack } = await import("../../src/ui/prompts.js");
    const result = await promptChoiceWithBack("Selecione:", [
      { name: "OpenRouter", value: "openrouter" },
      { name: "Acme", value: "acme" },
    ]);
    expect(result).toBe("openrouter");
    // a Voltar option must have been appended
    const choices = (select as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      choices: Array<{ name: string; value: string }>;
    };
    expect(choices.choices.some((c) => /voltar/i.test(c.name))).toBe(true);
  });

  it("returns null when the Voltar option is selected", async () => {
    const { select } = await import("@inquirer/prompts");
    const { BACK } = await import("../../src/ui/prompts.js");
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(BACK);
    const { promptChoiceWithBack } = await import("../../src/ui/prompts.js");
    const result = await promptChoiceWithBack("Selecione:", [{ name: "Acme", value: "acme" }]);
    expect(result).toBeNull();
  });
});
