// The cell-pitch grid baked into card.webp/hero.webp (spec: "Blueprint
// previews: terrain features and a real cell grid"). Pure — no sharp, no
// PIXI — so the geometry is unit-testable without a render pipeline.
//
// The old CSS grid behind the preview `<img>` was a fixed 32px pattern with
// no relationship to the blueprint's actual scale: a 2x3 building could read
// as 4x6 depending on how far the render was zoomed to fit. Baking real grid
// lines into the transparent parts of the image (never the opaque parts —
// they're drawn over the grid, not the other way round) fixes that without
// giving up the per-skin ground colour, which stays in CSS.

/** Pixel geometry of a render: cell size, and where cell (0,0)'s corner lands. */
export interface PreviewFraming {
  tileSize: number;
  offsetPx: { x: number; y: number };
}

// A denser grid than this reads as noise, not structure — skip it rather
// than mush a card down to an unreadable crosshatch.
const MIN_TILE_PX = 3;

const GRID_LINE_RGB = '255,255,255';
const GRID_LINE_ALPHA = 0.14;
const GRID_MAJOR_LINE_ALPHA = 0.32;
// Matches the editor's own every-5th-line emphasis (component-canvas.component.ts).
const GRID_MAJOR_EVERY = 5;

interface GridLine {
  /** Position along the axis being ruled, in output pixels. */
  pos: number;
  /** Cell index relative to cell (0,0), for the every-5th emphasis. */
  index: number;
}

// Every line position (and its cell index) within [0, extentPx], phase-locked
// to offsetPx so cell (0,0)'s own boundary is always exactly on a line.
function gridLines(offsetPx: number, tileSizePx: number, extentPx: number): GridLine[] {
  const first = Math.ceil(-offsetPx / tileSizePx);
  const lines: GridLine[] = [];
  for (let index = first; ; index++) {
    const pos = offsetPx + index * tileSizePx;
    if (pos > extentPx) break;
    lines.push({ pos, index });
  }
  return lines;
}

/**
 * SVG markup for a phase-aligned grid at cell pitch: transparent everywhere
 * but the lines, so compositing it under the (also transparent) artwork lets
 * the CSS background colour keep showing through where neither has content.
 * Returns null when there's nothing worth drawing (grid too dense, or no
 * lines fall in frame at all).
 */
export function buildPreviewGridSvg(
  width: number,
  height: number,
  framing: PreviewFraming,
  scale: number
): string | null {
  const tileSizePx = framing.tileSize * scale;
  if (!(tileSizePx >= MIN_TILE_PX)) return null;

  const verticals = gridLines(framing.offsetPx.x * scale, tileSizePx, width);
  const horizontals = gridLines(framing.offsetPx.y * scale, tileSizePx, height);
  if (verticals.length === 0 && horizontals.length === 0) return null;

  const line = (x1: number, y1: number, x2: number, y2: number, index: number): string => {
    const alpha = index % GRID_MAJOR_EVERY === 0 ? GRID_MAJOR_LINE_ALPHA : GRID_LINE_ALPHA;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(${GRID_LINE_RGB},${alpha})" stroke-width="1"/>`;
  };

  const lines =
    verticals.map(v => line(v.pos, 0, v.pos, height, v.index)).join('') +
    horizontals.map(h => line(0, h.pos, width, h.pos, h.index)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines}</svg>`;
}
