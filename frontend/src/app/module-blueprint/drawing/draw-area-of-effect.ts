import {
  AreaOfEffect,
  BlueprintItem,
  CameraService,
  orientAreaOfEffectCell,
  resolveAreaOfEffectCells,
  ROOM_BOUNDARY_DOORS,
  Vector2,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

export const AREA_OF_EFFECT_ALPHA = 0.18;
export const AREA_OF_EFFECT_BORDER_ALPHA = 1;

const EFFECT_COLORS: Readonly<Record<string, number>> = {
  elementIntake: 0x58c7e8,
  operationRange: 0xf2a65a,
  radiation: 0x9be564,
  skyScan: 0x8da0ff,
};

const cellKey = (cell: { x: number; y: number }): string =>
  `${cell.x},${cell.y}`;

export function solidFoundationCells(items: BlueprintItem[]): Set<string> {
  return blockerCells(items, false);
}

export function solidAndDoorBlockerCells(items: BlueprintItem[]): Set<string> {
  return blockerCells(items, true);
}

function blockerCells(
  items: BlueprintItem[],
  includeDoors: boolean,
): Set<string> {
  const cells = new Set<string>();
  for (const item of items) {
    if (
      !item.oniItem.isFoundation &&
      !(includeDoors && ROOM_BOUNDARY_DOORS.has(item.oniItem.id))
    )
      continue;
    const left = Math.round(item.topLeft?.x ?? item.position.x);
    const right = Math.round(item.bottomRight?.x ?? item.position.x);
    const top = Math.round(item.topLeft?.y ?? item.position.y);
    const bottom = Math.round(item.bottomRight?.y ?? item.position.y);
    for (let x = left; x <= right; x++)
      for (let y = top; y >= bottom; y--) cells.add(`${x},${y}`);
  }
  return cells;
}

/** Supercover grid ray: touching a solid tile corner also casts a shadow. */
export function isLightCellObstructed(
  emitter: Vector2,
  target: Vector2,
  solidCells: ReadonlySet<string>,
): boolean {
  let x = emitter.x;
  let y = emitter.y;
  const dx = target.x - emitter.x;
  const dy = target.y - emitter.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let ix = 0;
  let iy = 0;

  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // The ray crosses a grid corner. Either adjoining tile blocks diagonal leakage.
      if (
        solidCells.has(`${x + stepX},${y}`) ||
        solidCells.has(`${x},${y + stepY}`)
      )
        return true;
      x += stepX;
      y += stepY;
      ix++;
      iy++;
    } else if (decision < 0) {
      x += stepX;
      ix++;
    } else {
      y += stepY;
      iy++;
    }
    if (solidCells.has(`${x},${y}`)) return true;
  }
  return false;
}

function colorChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

export function areaOfEffectColor(effect: AreaOfEffect): number {
  if (effect.kind === "light") {
    if (effect.lightColor) {
      const { r, g, b } = effect.lightColor;
      return (colorChannel(r) << 16) | (colorChannel(g) << 8) | colorChannel(b);
    }
    return 0xffd45c;
  }
  return EFFECT_COLORS[effect.kind] ?? 0xb8b8b8;
}

export function drawAreaOfEffectItem(
  drawPixi: DrawPixi,
  item: BlueprintItem,
  camera: CameraService,
  solidCells: ReadonlySet<string> = new Set<string>(),
  solidAndDoorBlockers: ReadonlySet<string> = solidCells,
): void {
  for (const effect of item.oniItem.areasOfEffect ?? []) {
    const color = areaOfEffectColor(effect);
    let cells = resolveAreaOfEffectCells(effect).map((localCell) => {
      const cell = orientAreaOfEffectCell(localCell, item.orientation);
      return new Vector2(item.position.x + cell.x, item.position.y + cell.y);
    });
    const blockers =
      effect.kind === "light"
        ? solidCells
        : effect.kind === "operationRange" || effect.kind === "skyScan"
          ? solidAndDoorBlockers
          : undefined;
    // TODO: Radiation needs material-dependent attenuation, not binary cell occlusion.
    // Keep its exported nominal footprint until element/material data can be sampled here.
    if (effect.blockedBySolids && blockers && blockers.size > 0) {
      const localEmitter = orientAreaOfEffectCell(
        new Vector2(effect.origin.x, effect.origin.y),
        item.orientation,
      );
      const emitter = new Vector2(
        item.position.x + localEmitter.x,
        item.position.y + localEmitter.y,
      );
      cells = cells.filter(
        (cell) => !isLightCellObstructed(emitter, cell, blockers),
      );
    }
    const occupied = new Set(cells.map(cellKey));

    for (const { x, y } of cells) {
      drawPixi.drawTileRectangle(
        camera,
        new Vector2(x, y),
        new Vector2(x + 1, y - 1),
        false,
        0,
        color,
        color,
        AREA_OF_EFFECT_ALPHA,
        0,
      );
    }

    // PIXI line styles are stateful, so draw the complete fill before beginning
    // the perimeter pass. Only edges without an adjacent effect cell are outlined.
    for (const { x, y } of cells) {
      if (!occupied.has(`${x},${y + 1}`))
        drawPixi.drawBlueprintDashedLine(
          camera,
          new Vector2(x, y),
          new Vector2(x + 1, y),
          color,
          AREA_OF_EFFECT_BORDER_ALPHA,
        );
      if (!occupied.has(`${x + 1},${y}`))
        drawPixi.drawBlueprintDashedLine(
          camera,
          new Vector2(x + 1, y),
          new Vector2(x + 1, y - 1),
          color,
          AREA_OF_EFFECT_BORDER_ALPHA,
        );
      if (!occupied.has(`${x},${y - 1}`))
        drawPixi.drawBlueprintDashedLine(
          camera,
          new Vector2(x + 1, y - 1),
          new Vector2(x, y - 1),
          color,
          AREA_OF_EFFECT_BORDER_ALPHA,
        );
      if (!occupied.has(`${x - 1},${y}`))
        drawPixi.drawBlueprintDashedLine(
          camera,
          new Vector2(x, y - 1),
          new Vector2(x, y),
          color,
          AREA_OF_EFFECT_BORDER_ALPHA,
        );
    }
  }
}

export function drawAreaOfEffects(
  drawPixi: DrawPixi,
  items: BlueprintItem[],
  buildCandidate: BlueprintItem | null | undefined,
  buildToolVisible: boolean,
  camera: CameraService,
): void {
  const solidCells = solidFoundationCells(items);
  const solidAndDoorBlockers = solidAndDoorBlockerCells(items);
  for (const item of items) {
    if (item.selected)
      drawAreaOfEffectItem(
        drawPixi,
        item,
        camera,
        solidCells,
        solidAndDoorBlockers,
      );
  }
  if (buildToolVisible && buildCandidate?.isBuildCandidate)
    drawAreaOfEffectItem(
      drawPixi,
      buildCandidate,
      camera,
      solidCells,
      solidAndDoorBlockers,
    );
}
