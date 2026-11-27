import type { GridSettings, TokenCell } from './types';

const EPSILON = 1e-9;

export function wrapOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

export interface GridGeometry {
  columns: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  fullColumns: number;
  fullRows: number;
  cellWidth: number;
  cellHeight: number;
}

export function clampCellsAcross(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(120, Math.max(2, Math.round(value)));
}

/**
 * Grid units are normalized to the rendered scene frame.
 * `cellWidth` is a fraction of the frame width and `cellHeight` a fraction of the
 * frame height. Because the frame uses the background image's aspect ratio, a
 * square cell in pixels is guaranteed.
 */
export function gridGeometry(
  grid: GridSettings | null | undefined,
  aspect: number,
): GridGeometry | null {
  if (!grid) return null;

  const columns = clampCellsAcross(grid.cellsAcross);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const rows = columns / safeAspect;
  const offsetX = wrapOffset(grid.offsetX);
  const offsetY = wrapOffset(grid.offsetY);

  return {
    columns,
    rows,
    offsetX,
    offsetY,
    fullColumns: Math.max(0, Math.floor(columns - offsetX + EPSILON)),
    fullRows: Math.max(0, Math.floor(rows - offsetY + EPSILON)),
    cellWidth: 1 / columns,
    cellHeight: 1 / rows,
  };
}

export function cellAtPoint(
  geometry: GridGeometry,
  x: number,
  y: number,
): TokenCell | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const col = Math.floor(x / geometry.cellWidth - geometry.offsetX + EPSILON);
  const row = Math.floor(y / geometry.cellHeight - geometry.offsetY + EPSILON);

  if (col < 0 || col >= geometry.fullColumns) return null;
  if (row < 0 || row >= geometry.fullRows) return null;
  return { col, row };
}

export function cellCenter(
  geometry: GridGeometry,
  cell: TokenCell,
): { x: number; y: number } {
  return {
    x: (geometry.offsetX + cell.col + 0.5) * geometry.cellWidth,
    y: (geometry.offsetY + cell.row + 0.5) * geometry.cellHeight,
  };
}

export function gridLinePositions(geometry: GridGeometry): {
  vertical: number[];
  horizontal: number[];
} {
  const vertical: number[] = [];
  for (let index = 0; ; index += 1) {
    const x = (geometry.offsetX + index) * geometry.cellWidth;
    if (x > 1 + EPSILON) break;
    vertical.push(x * 100);
  }

  const horizontal: number[] = [];
  for (let index = 0; ; index += 1) {
    const y = (geometry.offsetY + index) * geometry.cellHeight;
    if (y > 1 + EPSILON) break;
    horizontal.push(y * 100);
  }

  return { vertical, horizontal };
}

export function tokenDiameterPercent(geometry: GridGeometry): number {
  return geometry.cellWidth * 100 * 0.78;
}
