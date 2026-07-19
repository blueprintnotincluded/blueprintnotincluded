import {
  AreaOfEffect,
  BlueprintItem,
  CameraService,
  orientAreaOfEffectCell,
  resolveAreaOfEffectCells,
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
): void {
  for (const effect of item.oniItem.areasOfEffect ?? []) {
    const color = areaOfEffectColor(effect);
    const cells = resolveAreaOfEffectCells(effect).map((localCell) => {
      const cell = orientAreaOfEffectCell(localCell, item.orientation);
      return new Vector2(item.position.x + cell.x, item.position.y + cell.y);
    });
    const occupied = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

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
  for (const item of items) {
    if (item.selected) drawAreaOfEffectItem(drawPixi, item, camera);
  }
  if (buildToolVisible && buildCandidate?.isBuildCandidate)
    drawAreaOfEffectItem(drawPixi, buildCandidate, camera);
}
