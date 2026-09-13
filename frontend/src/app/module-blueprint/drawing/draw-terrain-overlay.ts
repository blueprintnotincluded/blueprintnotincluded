import {
  activeTileOf,
  BniTerrainFeature,
  CameraService,
  drawDashedRect,
  drawTerrainFootprint,
  FALLBACK_ICON_INSET,
  positionTerrainSprite,
  terrainIconUrl,
  TerrainFeature,
  TerrainIconRect,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// Terrain annotations render deliberately unlike buildings: a building is
// something you will construct, a geyser is something that is already there.
// So each one is drawn as a translucent icon inside a dashed outline of its
// real footprint, rather than as an opaque sprite flush to the grid. The
// treatment reads as "context", and it also keeps a 4x2 Oil Reservoir from
// looking like a 4x2 building you forgot to cost. The shared geometry
// (footprint drawing, icon placement) lives in lib/src/drawing/terrain-markers.ts
// so the server-side preview worker draws the same thing; what's left here is
// the selection-only treatment (white outline, magenta active-tile highlight)
// and per-frame sprite pooling.
const SELECTED_COLOR = 0xffffff;

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

      drawTerrainFootprint(
        this.graphics,
        left,
        top,
        width,
        height,
        zoom,
        isSelected ? SELECTED_COLOR : undefined,
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

        drawDashedRect(
          this.activeTileGraphics,
          activeLeft,
          activeTop,
          zoom,
          zoom,
          zoom,
          ACTIVE_TILE_COLOR,
          Math.max(2, 0.06 * zoom),
          ACTIVE_TILE_BORDER_ALPHA,
        );
      }

      const sprite = this.sprites[i];
      if (sprite != null) {
        // A measured rect is drawn exactly, overhang and all. Without one the
        // icon is inset slightly so it sits inside its outline rather than
        // overprinting it — an inset the rect deliberately does not get, since
        // shrinking a measured placement would just make it wrong on purpose.
        positionTerrainSprite(
          sprite,
          left,
          top,
          width,
          height,
          feature.rect,
          zoom,
          FALLBACK_ICON_INSET,
        );
      }
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
