export function renderTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return "(nenhum registro encontrado)";
  }
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => row[col]?.length ?? 0))
  );
  const renderRow = (cells: string[]) =>
    cells.map((cell, col) => cell.padEnd(widths[col])).join("  ").trimEnd();
  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
}
