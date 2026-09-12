import { BniTerrainFeature } from '../blueprint/terrain-metadata';
import { TerrainFeature } from '../b-export/b-terrain-feature';

// How a terrain annotation becomes marks on the canvas: footprint geometry,
// icon placement, dashed-outline drawing. Pure and renderer-agnostic, because
// three renderers need the same answers — the editor overlay, the
// client-side export/thumbnail snapshots, and the server-side preview worker
// (which runs node PIXI in a child process and shares nothing else with the
// frontend). Selection-only concerns (the white selected outline, the
// magenta active-tile highlight, sprite pooling) stay in the frontend's
// DrawTerrainOverlay — a one-shot render never has a selection.

// Terrain annotations render deliberately unlike buildings: a building is
// something you will construct, a geyser is something that is already there.
// So each one is drawn as a translucent icon inside a dashed outline of its
// real footprint, rather than as an opaque sprite flush to the grid. The
// treatment reads as "context", and it also keeps a 4x2 Oil Reservoir from
// looking like a 4x2 building you forgot to cost.
export const FEATURE_ALPHA = 0.65;
export const OUTLINE_COLOR = 0x7dd3fc;
export const OUTLINE_ALPHA = 0.9;
export const FILL_ALPHA = 0.12;

// Only for features with no measured rect (see terrainIconPlacement): keeps the
// stretched icon just inside the dashed outline instead of overprinting it.
// Exported so TerrainTool's cursor ghost insets identically — the ghost has no
// outline of its own, but it has to predict where the placed icon will land.
export const FALLBACK_ICON_INSET = 0.86;

// An id the catalogue doesn't know still gets a marker — never drop data we
// don't recognise. It renders as the outline plus this placeholder glyph, and
// the panel shows the raw id.
const PLACEHOLDER_URL = 'assets/images/notes/note.png';

// Dashes are drawn manually: PIXI has no dashed line style, and a dashed
// outline is what separates "existing terrain" from the solid selection boxes
// the editor already uses for buildings.
const DASH_TILES = 0.25;

export function terrainIconUrl(feature: BniTerrainFeature): string {
  const known = TerrainFeature.getFeature(feature.id);
  return known != null ? known.iconUrl : PLACEHOLDER_URL;
}

export function terrainDisplayName(feature: BniTerrainFeature): string {
  const known = TerrainFeature.getFeature(feature.id);
  return known != null ? known.name : feature.id;
}

export interface TerrainIconRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerrainIconPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Where a feature's flat icon goes, in screen pixels, given its footprint's screen
// box. Top-left anchored, so callers set anchor(0, 0) once and never branch.
//
// Terrain icons are tight-cropped ~200 px/cell renders, not footprint-shaped art:
// a geyser's plume overhangs the top of its footprint and the rock skirt overhangs
// the sides. Stretching one to the footprint therefore both distorts it and hides
// the overhang the render was framed to include, which is what `uiImageRect` fixes
// — it is the measured rectangle, in cells, that the PNG maps linearly onto.
//
// Pure so both the overlay and the placement ghost can share it (they must agree,
// or the icon jumps between hover and click) and so it can be unit tested.
export function terrainIconPlacement(
  left: number,
  top: number,
  width: number,
  height: number,
  rect: TerrainIconRect | undefined,
  zoom: number,
  inset: number = 1
): TerrainIconPlacement {
  if (rect != null) {
    // The rect's origin is the footprint's bottom-left with +y up; screen y runs
    // down, so the icon's top edge is measured up from the footprint's bottom edge.
    return {
      x: left + rect.x * zoom,
      y: top + height - (rect.y + rect.h) * zoom,
      width: rect.w * zoom,
      height: rect.h * zoom,
    };
  }
  // No measurement — an id this catalogue doesn't know, or a database predating
  // the rects. Fill the footprint: wrong aspect, but the marker is still there.
  return {
    x: left + (width * (1 - inset)) / 2,
    y: top + (height * (1 - inset)) / 2,
    width: width * inset,
    height: height * inset,
  };
}

// The absolute cell a placed feature acts on. The offset comes from the
// catalogue (see BTerrainFeature.activeTile); an id we do not recognise has a
// single-cell footprint, so its anchor is the only cell it can act on.
export function activeTileOf(feature: BniTerrainFeature): {
  x: number;
  y: number;
} {
  const known = TerrainFeature.getFeature(feature.id);
  if (known == null) return { x: feature.x, y: feature.y };
  return {
    x: feature.x + known.activeTile.x,
    y: feature.y + known.activeTile.y,
  };
}

function dashedLine(
  target: any,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dash: number
): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  if (length === 0) return;
  const stepX = ((x1 - x0) / length) * dash;
  const stepY = ((y1 - y0) / length) * dash;
  const steps = Math.floor(length / dash);

  let x = x0;
  let y = y0;
  for (let i = 0; i < steps; i++) {
    if (i % 2 === 0) {
      target.moveTo(x, y);
      target.lineTo(x + stepX, y + stepY);
    }
    x += stepX;
    y += stepY;
  }
  // Finish the edge so corners always close, whatever the remainder.
  if (steps % 2 === 0) {
    target.moveTo(x, y);
    target.lineTo(x1, y1);
  }
}

// A dashed rectangle outline on an arbitrary PIXI Graphics target. Exported
// standalone (not folded into drawTerrainFootprint) because the editor
// overlay reuses it a second time for the active-tile highlight, which has
// its own colour and target layer.
export function drawDashedRect(
  target: any,
  left: number,
  top: number,
  width: number,
  height: number,
  zoom: number,
  color: number,
  thickness: number,
  alpha: number = OUTLINE_ALPHA
): void {
  const dash = Math.max(4, DASH_TILES * zoom);
  target.lineStyle(thickness, color, alpha);
  dashedLine(target, left, top, left + width, top, dash);
  dashedLine(target, left + width, top, left + width, top + height, dash);
  dashedLine(target, left + width, top + height, left, top + height, dash);
  dashedLine(target, left, top + height, left, top, dash);
}

// The feature's body: a translucent fill plus a dashed outline of its real
// footprint. `color`/`thickness`/`alpha` default to the unselected treatment;
// the editor overlay overrides them for a selected feature.
export function drawTerrainFootprint(
  graphics: any,
  left: number,
  top: number,
  width: number,
  height: number,
  zoom: number,
  color: number = OUTLINE_COLOR,
  thickness: number = Math.max(1.5, 0.05 * zoom),
  alpha: number = OUTLINE_ALPHA
): void {
  graphics.beginFill(color, FILL_ALPHA);
  graphics.lineStyle(0);
  graphics.drawRect(left, top, width, height);
  graphics.endFill();
  drawDashedRect(graphics, left, top, width, height, zoom, color, thickness, alpha);
}

// Places and sizes an already-created sprite at a feature's icon placement.
// Does not touch `sprite.anchor` — callers set that once, at sprite creation.
export function positionTerrainSprite(
  sprite: any,
  left: number,
  top: number,
  width: number,
  height: number,
  rect: TerrainIconRect | undefined,
  zoom: number,
  inset: number = FALLBACK_ICON_INSET
): TerrainIconPlacement {
  sprite.alpha = FEATURE_ALPHA;
  const p = terrainIconPlacement(left, top, width, height, rect, zoom, inset);
  sprite.x = p.x;
  sprite.y = p.y;
  sprite.width = p.width;
  sprite.height = p.height;
  return p;
}

// One-shot draw of a feature's footprint + icon: the unselected treatment,
// with no pooling and no active-tile highlight. What a single-pass renderer
// (the preview worker) needs; the editor overlay draws the same pieces
// itself so it can pool sprites and add selection state.
export function drawTerrainFeature(
  graphics: any,
  sprite: any,
  left: number,
  top: number,
  width: number,
  height: number,
  zoom: number,
  rect: TerrainIconRect | undefined
): void {
  drawTerrainFootprint(graphics, left, top, width, height, zoom);
  sprite.anchor.set(0, 0);
  positionTerrainSprite(sprite, left, top, width, height, rect, zoom);
}
