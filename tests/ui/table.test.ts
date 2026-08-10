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

  it("truncates long columns to fit a small maxWidth and appends an ellipsis", () => {
    const output = renderTable(
      ["Nome", "URL"],
      [["openrouter", "https://openrouter.ai/api/v1/very/long/path/here"]],
      // 30 cols: header "Nome"(4) + sep(2) + URL must fit in ~24 → URL gets truncated.
      30
    );
    const lines = output.split("\n");
    // header row has no truncation (short headers), but the data URL must be truncated.
    expect(lines[1]).toContain("…");
    // total line width must not exceed the requested maxWidth
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });

  it("keeps natural padding (no truncation) when everything fits maxWidth", () => {
    const output = renderTable(
      ["Nome", "URL"],
      [["local", "http://localhost:11434/v1"]],
      80
    );
    const lines = output.split("\n");
    expect(lines[1]).toBe("local  http://localhost:11434/v1");
    expect(lines[1]).not.toContain("…");
  });
});
