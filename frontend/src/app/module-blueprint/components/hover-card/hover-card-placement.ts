// Where the hover card goes. Pure, so the geometry is testable without a
// browser.

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

// Space between the hovered cell and the card, and between the card and the
// viewport's edge.
export const HOVER_CARD_GAP = 8;

// The screen rect of a tile, in the canvas's own pixels. The inverse of
// CameraService.getTileCoords as the canvas rounds it (floor x, ceil y):
// tile y spans tile coordinates (y - 1, y], and screen y grows downward.
export function cellScreenRect(
  tile: { x: number; y: number },
  camera: { cameraOffset: { x: number; y: number }; currentZoom: number },
): ScreenRect {
  const zoom = camera.currentZoom;
  return {
    left: (tile.x + camera.cameraOffset.x) * zoom,
    top: (camera.cameraOffset.y - tile.y) * zoom,
    width: zoom,
    height: zoom,
  };
}

// Down and to the right of the hovered cell, anchored to the cell rather than
// the cursor: zoomed in, a cell is 100 px or more, and a card at the cursor
// would cover the very cell it describes. Near the right or bottom edge the
// card flips to the left of or above the cell — each axis on its own, so the
// card stays in a diagonal quadrant and never overlaps the cell. Only when
// neither side of an axis fits does it clamp to the viewport.
export function placeHoverCard(
  cell: ScreenRect,
  card: ScreenSize,
  viewport: ScreenSize,
  gap: number = HOVER_CARD_GAP,
): { left: number; top: number } {
  return {
    left: placeOnAxis(cell.left, cell.width, card.width, viewport.width, gap),
    top: placeOnAxis(cell.top, cell.height, card.height, viewport.height, gap),
  };
}

function placeOnAxis(
  cellStart: number,
  cellSize: number,
  cardSize: number,
  viewportSize: number,
  gap: number,
): number {
  const after = cellStart + cellSize + gap;
  if (after + cardSize <= viewportSize - gap) return after;
  const before = cellStart - gap - cardSize;
  if (before >= gap) return before;
  // Fits on neither side: keep to whichever side has more room, inside the
  // viewport.
  const roomAfter = viewportSize - (cellStart + cellSize);
  const roomBefore = cellStart;
  const preferred = roomAfter >= roomBefore ? after : before;
  return Math.max(gap, Math.min(preferred, viewportSize - gap - cardSize));
}
