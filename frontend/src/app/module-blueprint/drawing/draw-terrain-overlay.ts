import {
  BniTerrainFeature,
  CameraService,
  TerrainFeature,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// Terrain annotations render deliberately unlike buildings: a building is
// something you will construct, a geyser is something that is already there.
// So each one is drawn as a translucent icon inside a dashed outline of its
// real footprint, rather than as an opaque sprite flush to the grid. The
// treatment reads as "context", and it also keeps a 4x2 Oil Reservoir from
// looking like a 4x2 building you forgot to cost.
const FEATURE_ALPHA = 0.65;
const OUTLINE_COLOR = 0x7dd3fc;
const OUTLINE_ALPHA = 0.9;
const FILL_ALPHA = 0.12;
const SELECTED_COLOR = 0xffffff;

// Only for features with no measured rect (see terrainIconPlacement): keeps the
// stretched icon just inside the dashed outline instead of overprinting it.
const FALLBACK_ICON_INSET = 0.86;

// Area of effect for a selected feature. A geyser acts on exactly ONE cell —
// where it erupts — not on its whole footprint, which is mostly scenery. So a
// selected feature highlights that single cell, in the same visual language a
// selected building uses for its own areasOfEffect (fill + dashed perimeter).
//
// Magenta specifically: this marker lands *on top of* the feature's own art,
// which runs grey rock, blue ice and orange lava. A warm colour vanished into
// the volcano sprite; magenta appears nowhere in the geyser icon set, so it
// reads against all of them. It is also distinct from the cyan footprint
// outline and the white selection outline it sits inside.
const ACTIVE_TILE_COLOR = 0xff3ea5;
const ACTIVE_TILE_FILL_ALPHA = 0.4;
const ACTIVE_TILE_BORDER_ALPHA = 1;

// An id the catalogue doesn't know still gets a marker — never drop data we
// don't recognise. It renders as the outline plus this placeholder glyph, and
// the panel shows the raw id.
const PLACEHOLDER_URL = "assets/images/notes/note.png";

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
  inset: number = 1,
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

// One resolved marker: footprint in cells plus the texture to draw inside it.
interface PreparedFeature {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  // Absolute cell the feature acts on.
  activeX: number;
  activeY: number;
  // Measured icon placement, when the catalogue has one for this id.
  rect: TerrainIconRect | undefined;
}

function prepare(feature: BniTerrainFeature): PreparedFeature {
  const known = TerrainFeature.getFeature(feature.id);
  const active = activeTileOf(feature);
  return {
    x: feature.x,
    y: feature.y,
    width: known != null ? known.width : 1,
    height: known != null ? known.height : 1,
    url: terrainIconUrl(feature),
    activeX: active.x,
    activeY: active.y,
    rect: known?.uiImageRect,
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

// Renders terrain annotations above buildings. Same pooling discipline as
// DrawNotesOverlay: one Graphics for the outlines (recomputed per frame for the
// camera transform) plus create-once/mutate-per-frame sprites, so panning does
// not allocate.
export class DrawTerrainOverlay {
  private container: any;
  private graphics: any;
  // Second graphics layer, kept above the icons. The active-tile highlight sits
  // entirely *inside* the footprint, so drawn on the lower layer it would be
  // hidden by the feature's own art — unlike a building's area of effect, which
  // usually extends past the building and reads fine underneath it.
  private activeTileGraphics: any;
  private sprites: any[] = [];

  private lastFeatures: BniTerrainFeature[] | null = null;
  private prepared: PreparedFeature[] = [];

  // `parent` defaults to the live app stage; the off-screen export snapshots
  // pass their own scratch container, since that is what gets captured to a
  // texture and the app stage is never part of that render.
  constructor(
    private drawPixi: DrawPixi,
    parent: any = drawPixi.pixiApp.stage,
  ) {
    this.container = drawPixi.getNewContainer();
    this.graphics = drawPixi.getNewGraphics();
    this.container.addChild(this.graphics);
    this.activeTileGraphics = drawPixi.getNewGraphics();
    this.container.addChild(this.activeTileGraphics);
    parent.addChild(this.container);
  }

  clear() {
    if (!this.container.visible) return;
    this.container.visible = false;
    this.graphics.clear();
    this.activeTileGraphics.clear();
    for (const sprite of this.sprites) sprite.visible = false;
    // Forget the cached array identity along with the hidden sprites. Hiding
    // the layer does not change blueprint.terrainFeatures, so re-showing it
    // arrives with the *same* array — without this, the identity check in
    // draw() would skip syncSprites() and the icons would stay hidden, leaving
    // dashed outlines with nothing inside them.
    this.lastFeatures = null;
  }

  draw(
    features: BniTerrainFeature[] | null | undefined,
    camera: CameraService,
    selected?: BniTerrainFeature | null,
  ) {
    if (features == null || features.length === 0) {
      this.clear();
      this.lastFeatures = features ?? null;
      return;
    }

    this.container.visible = true;
    this.graphics.clear();
    this.activeTileGraphics.clear();

    if (features !== this.lastFeatures) {
      this.lastFeatures = features;
      this.prepared = features.map(prepare);
      this.syncSprites();
    }

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;

    for (let i = 0; i < this.prepared.length; i++) {
      const feature = this.prepared[i];

      // Cell coords are bottom-left anchored and y-up; screen is y-down, so the
      // top edge of the footprint is the anchor plus its height.
      const left = (feature.x + offset.x) * zoom;
      const top = (offset.y - feature.y - feature.height + 1) * zoom;
      const width = feature.width * zoom;
      const height = feature.height * zoom;

      const isSelected =
        selected != null &&
        selected.x === feature.x &&
        selected.y === feature.y;

      this.graphics.beginFill(OUTLINE_COLOR, FILL_ALPHA);
      this.graphics.lineStyle(0);
      this.graphics.drawRect(left, top, width, height);
      this.graphics.endFill();

      this.drawDashedRect(
        left,
        top,
        width,
        height,
        zoom,
        isSelected ? SELECTED_COLOR : OUTLINE_COLOR,
        Math.max(isSelected ? 2.5 : 1.5, (isSelected ? 0.08 : 0.05) * zoom),
      );

      // Area of effect: the single cell the feature acts on, drawn only while
      // it is selected — same as a building, which shows its areasOfEffect on
      // selection. The footprint outline above is the feature's body; this is
      // the one cell that actually does anything.
      if (isSelected) {
        const activeLeft = (feature.activeX + offset.x) * zoom;
        const activeTop = (offset.y - feature.activeY) * zoom;

        this.activeTileGraphics.beginFill(
          ACTIVE_TILE_COLOR,
          ACTIVE_TILE_FILL_ALPHA,
        );
        this.activeTileGraphics.lineStyle(0);
        this.activeTileGraphics.drawRect(activeLeft, activeTop, zoom, zoom);
        this.activeTileGraphics.endFill();

        this.drawDashedRect(
          activeLeft,
          activeTop,
          zoom,
          zoom,
          zoom,
          ACTIVE_TILE_COLOR,
          Math.max(2, 0.06 * zoom),
          ACTIVE_TILE_BORDER_ALPHA,
          this.activeTileGraphics,
        );
      }

      const sprite = this.sprites[i];
      if (sprite != null) {
        sprite.alpha = FEATURE_ALPHA;
        // A measured rect is drawn exactly, overhang and all. Without one the
        // icon is inset slightly so it sits inside its outline rather than
        // overprinting it — an inset the rect deliberately does not get, since
        // shrinking a measured placement would just make it wrong on purpose.
        const p = terrainIconPlacement(
          left,
          top,
          width,
          height,
          feature.rect,
          zoom,
          FALLBACK_ICON_INSET,
        );
        sprite.x = p.x;
        sprite.y = p.y;
        sprite.width = p.width;
        sprite.height = p.height;
      }
    }
  }

  private drawDashedRect(
    left: number,
    top: number,
    width: number,
    height: number,
    zoom: number,
    color: number,
    thickness: number,
    alpha: number = OUTLINE_ALPHA,
    target: any = this.graphics,
  ) {
    const dash = Math.max(4, DASH_TILES * zoom);
    target.lineStyle(thickness, color, alpha);
    this.dashedLine(target, left, top, left + width, top, dash);
    this.dashedLine(
      target,
      left + width,
      top,
      left + width,
      top + height,
      dash,
    );
    this.dashedLine(
      target,
      left + width,
      top + height,
      left,
      top + height,
      dash,
    );
    this.dashedLine(target, left, top + height, left, top, dash);
  }

  private dashedLine(
    target: any,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    dash: number,
  ) {
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

  // One sprite per annotation, indexed like this.prepared. The pool is never
  // truncated: entries beyond the current count are hidden and kept for reuse,
  // so sprites never leak as orphaned container children.
  private syncSprites() {
    for (let i = 0; i < this.prepared.length; i++) {
      let sprite = this.sprites[i];
      if (sprite == null) {
        sprite = this.drawPixi.getSpriteFrom(this.prepared[i].url);
        // Top-left anchored: terrainIconPlacement returns the icon's own
        // rectangle, which is not centred on the footprint once a measured rect
        // puts overhanging art outside it.
        sprite.anchor.set(0, 0);
        this.container.addChild(sprite);
        this.sprites[i] = sprite;
      } else {
        sprite.texture = this.drawPixi.getNewBaseTexture(this.prepared[i].url);
      }
      sprite.visible = true;
    }
    for (let i = this.prepared.length; i < this.sprites.length; i++)
      this.sprites[i].visible = false;

    // Sprites are appended as they are created, so re-append the active-tile
    // layer to keep it last (addChild moves an existing child to the end).
    this.container.addChild(this.activeTileGraphics);
  }
}
