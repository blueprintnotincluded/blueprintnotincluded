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

// One resolved marker: footprint in cells plus the texture to draw inside it.
interface PreparedFeature {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

function prepare(feature: BniTerrainFeature): PreparedFeature {
  const known = TerrainFeature.getFeature(feature.id);
  return {
    x: feature.x,
    y: feature.y,
    width: known != null ? known.width : 1,
    height: known != null ? known.height : 1,
    url: terrainIconUrl(feature),
  };
}

// Renders terrain annotations above buildings. Same pooling discipline as
// DrawNotesOverlay: one Graphics for the outlines (recomputed per frame for the
// camera transform) plus create-once/mutate-per-frame sprites, so panning does
// not allocate.
export class DrawTerrainOverlay {
  private container: any;
  private graphics: any;
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
    parent.addChild(this.container);
  }

  clear() {
    if (!this.container.visible) return;
    this.container.visible = false;
    this.graphics.clear();
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

      const sprite = this.sprites[i];
      if (sprite != null) {
        sprite.alpha = FEATURE_ALPHA;
        // Inset slightly so the icon sits inside its outline rather than
        // overprinting it.
        sprite.width = width * 0.86;
        sprite.height = height * 0.86;
        sprite.x = left + width / 2;
        sprite.y = top + height / 2;
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
  ) {
    const dash = Math.max(4, DASH_TILES * zoom);
    this.graphics.lineStyle(thickness, color, OUTLINE_ALPHA);
    this.dashedLine(left, top, left + width, top, dash);
    this.dashedLine(left + width, top, left + width, top + height, dash);
    this.dashedLine(left + width, top + height, left, top + height, dash);
    this.dashedLine(left, top + height, left, top, dash);
  }

  private dashedLine(
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
        this.graphics.moveTo(x, y);
        this.graphics.lineTo(x + stepX, y + stepY);
      }
      x += stepX;
      y += stepY;
    }
    // Finish the edge so corners always close, whatever the remainder.
    if (steps % 2 === 0) {
      this.graphics.moveTo(x, y);
      this.graphics.lineTo(x1, y1);
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
        sprite.anchor.set(0.5, 0.5);
        this.container.addChild(sprite);
        this.sprites[i] = sprite;
      } else {
        sprite.texture = this.drawPixi.getNewBaseTexture(this.prepared[i].url);
      }
      sprite.visible = true;
    }
    for (let i = this.prepared.length; i < this.sprites.length; i++)
      this.sprites[i].visible = false;
  }
}
