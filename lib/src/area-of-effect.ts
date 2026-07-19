import { Orientation } from './enums/orientation';
import { Vector2 } from './vector2';

export interface AreaOfEffect {
  kind: 'light' | 'elementIntake' | 'operationRange' | 'radiation' | 'skyScan' | string;
  source: string;
  shape:
    | 'circle'
    | 'cone'
    | 'quad'
    | 'diamond'
    | 'rect'
    | 'ellipse'
    | 'ellipseArc'
    | 'skyColumns'
    | string;
  origin: { x: number; y: number };
  blockedBySolids: boolean;
  cells?: [number, number][];
  range?: number;
  lux?: number;
  falloffRate?: number;
  lightColor?: { r: number; g: number; b: number; a: number };
  width?: number;
  direction?: 'North' | 'East' | 'South' | 'West';
  radius?: number;
  element?: string;
  consumptionRate?: number;
  rectMin?: { x: number; y: number };
  rectMax?: { x: number; y: number };
  radiusX?: number;
  radiusY?: number;
  rads?: number;
  arcAngle?: number;
  arcDirection?: number;
  emitType?: string;
  radiusScalesWithRads?: boolean;
  scanMinX?: number;
  scanMaxX?: number;
  verticalStep?: number;
}

export const AREA_OF_EFFECT_GENERATED_CELL_LIMIT = 4096;
export const SKY_SCAN_PREVIEW_HEIGHT = 25;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = stableValue(record[key]);
    return sorted;
  }
  return value;
}

export function dedupeAreasOfEffect(effects: AreaOfEffect[] | null | undefined): AreaOfEffect[] {
  const seen = new Set<string>();
  const result: AreaOfEffect[] = [];
  for (const effect of effects ?? []) {
    if (effect == null || typeof effect !== 'object') continue;
    const signature = JSON.stringify(stableValue(effect));
    if (!seen.has(signature)) {
      seen.add(signature);
      result.push(effect);
    }
  }
  return result;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function isInsideArc(dx: number, dy: number, direction: number, angle: number): boolean {
  if (angle >= 360) return true;
  if (dx === 0 && dy === 0) return true;
  const cellAngle = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const delta = Math.abs(normalizeDegrees(cellAngle - normalizeDegrees(direction) + 180) - 180);
  return delta <= angle / 2 + Number.EPSILON;
}

/** Resolve an effect to pre-orientation offsets from the building origin cell. */
export function resolveAreaOfEffectCells(effect: AreaOfEffect): Vector2[] {
  if (Array.isArray(effect.cells) && effect.cells.length > 0) {
    return effect.cells
      .filter(
        (cell): cell is [number, number] =>
          Array.isArray(cell) && cell.length >= 2 && finiteNumber(cell[0]) && finiteNumber(cell[1])
      )
      .slice(0, AREA_OF_EFFECT_GENERATED_CELL_LIMIT)
      .map(([x, y]) => new Vector2(x, y));
  }

  const origin = effect.origin;
  if (!origin || !finiteNumber(origin.x) || !finiteNumber(origin.y)) return [];

  if (effect.shape === 'ellipse' || effect.shape === 'ellipseArc') {
    if (
      !finiteNumber(effect.radiusX) ||
      !finiteNumber(effect.radiusY) ||
      effect.radiusX <= 0 ||
      effect.radiusY <= 0
    )
      return [];

    const maxX = Math.ceil(effect.radiusX);
    const maxY = Math.ceil(effect.radiusY);
    if ((maxX * 2 + 1) * (maxY * 2 + 1) > AREA_OF_EFFECT_GENERATED_CELL_LIMIT * 2) return [];

    const arcAngle = effect.arcAngle ?? 360;
    const arcDirection = effect.arcDirection ?? 0;
    if (!finiteNumber(arcAngle) || !finiteNumber(arcDirection) || arcAngle < 0) return [];

    const cells: Vector2[] = [];
    for (let dx = -maxX; dx <= maxX; dx++) {
      for (let dy = -maxY; dy <= maxY; dy++) {
        const ellipseDistance =
          (dx * dx) / (effect.radiusX * effect.radiusX) +
          (dy * dy) / (effect.radiusY * effect.radiusY);
        if (ellipseDistance > 1 + Number.EPSILON) continue;
        if (effect.shape === 'ellipseArc' && !isInsideArc(dx, dy, arcDirection, arcAngle)) continue;
        cells.push(new Vector2(origin.x + dx, origin.y + dy));
        if (cells.length > AREA_OF_EFFECT_GENERATED_CELL_LIMIT) return [];
      }
    }
    return cells;
  }

  if (effect.shape === 'skyColumns') {
    if (!finiteNumber(effect.scanMinX) || !finiteNumber(effect.scanMaxX)) return [];
    const minX = Math.ceil(effect.scanMinX);
    const maxX = Math.floor(effect.scanMaxX);
    if (
      minX > maxX ||
      (maxX - minX + 1) * SKY_SCAN_PREVIEW_HEIGHT > AREA_OF_EFFECT_GENERATED_CELL_LIMIT
    )
      return [];
    const cells: Vector2[] = [];
    for (let x = minX; x <= maxX; x++)
      for (let y = 0; y < SKY_SCAN_PREVIEW_HEIGHT; y++)
        cells.push(new Vector2(origin.x + x, origin.y + y));
    return cells;
  }

  return [];
}

/** Apply the same rotate-then-flip convention used by building utility ports. */
export function orientAreaOfEffectCell(cell: Vector2, orientation: Orientation): Vector2 {
  switch (orientation) {
    case Orientation.R90:
      return new Vector2(cell.y, -cell.x);
    case Orientation.R180:
      return new Vector2(-cell.x, -cell.y);
    case Orientation.R270:
      return new Vector2(-cell.y, cell.x);
    case Orientation.FlipH:
      return new Vector2(-cell.x, cell.y);
    case Orientation.FlipV:
      return new Vector2(cell.x, -cell.y);
    default:
      return new Vector2(cell.x, cell.y);
  }
}
