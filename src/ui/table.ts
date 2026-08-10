// Column separator width (matches the historical "  " join in renderRow).
const SEP = 2;

/**
 * Renders a compact text table. Columns are padded to the natural width of their widest cell,
 * but when the total would exceed `maxWidth` (terminal width by default), overflowing columns
 * are truncated with an ellipsis so long URLs don't push the layout off-screen. Truncation
 * prefers the rightmost columns (typically URLs / timestamps) — names in the first column are
 * preserved as long as possible.
 *
 * @param maxWidth total available width. Defaults to the live terminal width with a 100-col
 *   fallback when stdout has no columns (piped / non-tty). Pass explicitly in tests.
 */
export function renderTable(
  headers: string[],
  rows: string[][],
  maxWidth: number = defaultMaxWidth()
): string {
  if (rows.length === 0) {
    return "(nenhum registro encontrado)";
  }
  const colCount = headers.length;
  const naturalWidths = headers.map((_, col) =>
    Math.max(headers[col].length, ...rows.map((row) => row[col]?.length ?? 0))
  );
  const naturalTotal = naturalWidths.reduce((a, b) => a + b, 0) + SEP * (colCount - 1);

  // When everything fits naturally, keep the original padding behavior (no truncation).
  if (naturalTotal <= maxWidth) {
    const renderRow = (cells: string[]) =>
      cells.map((cell, col) => cell.padEnd(naturalWidths[col])).join("  ").trimEnd();
    return [renderRow(headers), ...rows.map(renderRow)].join("\n");
  }

  // Otherwise distribute widths greedily from the LEFT: each column gets its natural width up to
  // a per-column cap, and whatever's left after the cap goes to later columns. This keeps names
  // readable and pushes truncation onto long URLs / timestamps.
  const maxPerCol = Math.max(12, Math.floor(maxWidth / colCount) * 2); // allow some columns to be wider
  const widths = fitWidths(naturalWidths, maxWidth, maxPerCol);

  const renderRow = (cells: string[]) =>
    cells.map((cell, col) => truncate(cell, widths[col]).padEnd(widths[col])).join("  ").trimEnd();
  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
}

function defaultMaxWidth(): number {
  const cols = typeof process !== "undefined" && process.stdout?.columns ? process.stdout.columns : 0;
  return cols > 0 ? cols : 100;
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return text.slice(0, width - 1) + "…";
}

/**
 * Assigns each column a final width so the table fits in `maxWidth` (including separators).
 * Columns needing less than their natural width are capped; the budget saved is redistributed
 * rightward. Falls back to proportional shrinking when even the caps don't fit.
 */
function fitWidths(natural: number[], maxWidth: number, maxPerCol: number): number[] {
  const colCount = natural.length;
  const sepTotal = SEP * (colCount - 1);
  const budget = Math.max(0, maxWidth - sepTotal);

  // First pass: cap each column at maxPerCol, keep the rest as its natural width.
  let widths = natural.map((w) => Math.min(w, maxPerCol));
  let used = widths.reduce((a, b) => a + b, 0);

  // If still over budget, shrink proportionally (preserve relative column importance).
  if (used > budget) {
    const scale = budget / used;
    widths = widths.map((w) => Math.max(4, Math.floor(w * scale)));
    used = widths.reduce((a, b) => a + b, 0);
  }

  // Redistribute leftover budget (when under) to columns that are still truncated, rightmost first.
  let leftover = budget - used;
  if (leftover > 0) {
    for (let i = colCount - 1; i >= 0 && leftover > 0; i--) {
      const room = natural[i] - widths[i];
      if (room > 0) {
        const give = Math.min(room, leftover);
        widths[i] += give;
        leftover -= give;
      }
    }
  }
  return widths;
}
