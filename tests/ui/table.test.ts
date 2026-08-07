import { describe, expect, it } from "vitest";
import { renderTable } from "../../src/ui/table.js";

describe("renderTable", () => {
  it("pads columns to the widest cell and separates with two spaces", () => {
    const output = renderTable(
      ["Nome", "URL"],
      [
        ["openrouter", "https://openrouter.ai/api/v1"],
        ["local", "http://localhost:11434/v1"],
      ]
    );
    const lines = output.split("\n");
    expect(lines[0]).toBe("Nome        URL");
    expect(lines[1]).toBe("openrouter  https://openrouter.ai/api/v1");
    expect(lines[2]).toBe("local       http://localhost:11434/v1");
  });

  it("returns a placeholder line when rows is empty", () => {
    expect(renderTable(["Nome"], [])).toBe("(nenhum registro encontrado)");
  });
});
