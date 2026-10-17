import { describe, it, expect } from "vitest";
import { CameraService, Vector2 } from "../../../../../../lib/index";
import {
  HOVER_CARD_GAP,
  cellScreenRect,
  placeHoverCard,
} from "./hover-card-placement";

const VIEWPORT = { width: 1000, height: 800 };
const CARD = { width: 200, height: 100 };
const GAP = HOVER_CARD_GAP;

describe("cellScreenRect", () => {
  it("is the cell the canvas resolves the cursor to", () => {
    const camera = new CameraService(null);
    camera.cameraOffset = new Vector2(3.25, 7.5);
    camera.currentZoom = 40;

    for (const cursor of [
      new Vector2(10, 10),
      new Vector2(399, 233),
      new Vector2(640.5, 120.25),
    ]) {
      // ComponentCanvasComponent.getCurrentTile's rounding.
      const coords = camera.getTileCoords(cursor);
      const tile = { x: Math.floor(coords.x), y: Math.ceil(coords.y) };

      const rect = cellScreenRect(tile, camera);

      expect(rect.width).toBe(40);
      expect(rect.height).toBe(40);
      expect(cursor.x).toBeGreaterThanOrEqual(rect.left);
      expect(cursor.x).toBeLessThan(rect.left + rect.width);
      expect(cursor.y).toBeGreaterThanOrEqual(rect.top);
      expect(cursor.y).toBeLessThan(rect.top + rect.height);
    }
  });
});

describe("placeHoverCard", () => {
  it("goes down and to the right of the cell, past its corner", () => {
    const cell = { left: 100, top: 100, width: 30, height: 30 };
    expect(placeHoverCard(cell, CARD, VIEWPORT)).toEqual({
      left: 130 + GAP,
      top: 130 + GAP,
    });
  });

  it("anchors to the cell, so a big cell keeps its card clear of it", () => {
    const cell = { left: 100, top: 100, width: 150, height: 150 };
    expect(placeHoverCard(cell, CARD, VIEWPORT)).toEqual({
      left: 250 + GAP,
      top: 250 + GAP,
    });
  });

  it("flips to the left near the right edge", () => {
    const cell = { left: 900, top: 100, width: 30, height: 30 };
    expect(placeHoverCard(cell, CARD, VIEWPORT)).toEqual({
      left: 900 - GAP - CARD.width,
      top: 130 + GAP,
    });
  });

  it("flips above near the bottom edge", () => {
    const cell = { left: 100, top: 750, width: 30, height: 30 };
    expect(placeHoverCard(cell, CARD, VIEWPORT)).toEqual({
      left: 130 + GAP,
      top: 750 - GAP - CARD.height,
    });
  });

  it("flips both ways in the bottom-right corner, never over the cell", () => {
    const cell = { left: 900, top: 750, width: 30, height: 30 };
    const placed = placeHoverCard(cell, CARD, VIEWPORT);
    expect(placed).toEqual({
      left: 900 - GAP - CARD.width,
      top: 750 - GAP - CARD.height,
    });
    expect(placed.left + CARD.width).toBeLessThanOrEqual(cell.left);
    expect(placed.top + CARD.height).toBeLessThanOrEqual(cell.top);
  });

  it("clamps into the viewport when neither side of an axis fits", () => {
    const cell = { left: 50, top: 100, width: 900, height: 30 };
    const placed = placeHoverCard(cell, CARD, VIEWPORT);
    expect(placed.left).toBeGreaterThanOrEqual(GAP);
    expect(placed.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - GAP);
    expect(placed.top).toBe(130 + GAP);
  });
});
