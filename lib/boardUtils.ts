import { Cell, Column } from "@/types/board";

export const MIN_COL_PX = 140;
export const MIN_ROW_PX = 80;

export function normalizeFracs(columns: Column[]): Column[] {
  const total = columns.reduce((sum, column) => sum + column.frac, 0);
  if (total === 0) {
    return columns;
  }
  return columns.map((column) => ({
    ...column,
    frac: column.frac / total,
  }));
}

export function clampSpansToRows(
  cells: Cell[],
  rows: number,
  options?: { preserveIndex?: number },
): Cell[] {
  if (cells.length === 0) {
    return cells;
  }

  const normalized = cells.map((cell) => ({
    ...cell,
    span: Math.max(1, Math.round(cell.span)),
  }));

  const preserveIndex = options?.preserveIndex;

  const total = normalized.reduce((sum, cell) => sum + cell.span, 0);

  if (total === rows) {
    return normalized;
  }

  if (total < rows) {
    const deficit = rows - total;
    const targetIndex = Math.min(normalized.length - 1, Math.max(0, preserveIndex ?? normalized.length - 1));
    normalized[targetIndex] = {
      ...normalized[targetIndex],
      span: normalized[targetIndex].span + deficit,
    };
    return normalized;
  }

  let overflow = total - rows;

  const reductionOrder = normalized.map((_, index) => index);
  if (typeof preserveIndex === "number") {
    const preservePosition = reductionOrder.indexOf(preserveIndex);
    if (preservePosition >= 0) {
      reductionOrder.splice(preservePosition, 1);
      reductionOrder.push(preserveIndex);
    }
  }

  for (const index of reductionOrder) {
    if (overflow <= 0) {
      break;
    }
    const cell = normalized[index];
    const maxReduction = Math.max(cell.span - 1, 0);
    if (maxReduction === 0) {
      continue;
    }
    const reduction = Math.min(maxReduction, overflow);
    overflow -= reduction;
    normalized[index] = {
      ...cell,
      span: cell.span - reduction,
    };
  }

  if (overflow > 0) {
    const lastIndex = normalized.length - 1;
    normalized[lastIndex] = {
      ...normalized[lastIndex],
      span: Math.max(1, normalized[lastIndex].span - overflow),
    };
    overflow = 0;
  }

  const finalTotal = normalized.reduce((sum, cell) => sum + cell.span, 0);
  if (finalTotal < rows) {
    const targetIndex = Math.min(normalized.length - 1, Math.max(0, preserveIndex ?? normalized.length - 1));
    normalized[targetIndex] = {
      ...normalized[targetIndex],
      span: normalized[targetIndex].span + (rows - finalTotal),
    };
  }

  return normalized;
}

export function absorbSpanAfterRemoval(
  cells: Cell[],
  removedIndex: number,
  removedSpan: number,
): Cell[] {
  if (cells.length === 0) {
    return cells;
  }
  const targetIndex = removedIndex > 0 ? removedIndex - 1 : 0;
  return cells.map((cell, index) =>
    index === targetIndex
      ? {
          ...cell,
          span: cell.span + removedSpan,
        }
      : cell,
  );
}

export function insertCellWithClamp(
  cells: Cell[],
  insertIndex: number,
  newCell: Cell,
  rows: number,
): Cell[] {
  const next = [...cells];
  const boundedIndex = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(boundedIndex, 0, { ...newCell });
  return clampSpansToRows(next, rows, { preserveIndex: boundedIndex });
}

export function sumSpans(cells: Cell[]): number {
  return cells.reduce((sum, cell) => sum + cell.span, 0);
}
