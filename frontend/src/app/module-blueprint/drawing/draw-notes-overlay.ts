import {
  BniWorldNote,
  BuildableElement,
  CameraService,
  MARKER_URLS,
  MarkerName,
  NOTE_ICON_TILE_FRACTION,
  noteBadgeColor,
  noteMarkerSprite,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// The editor's world-note layer. Which sprite a note draws as, in what colour
// and at what size is shared with the export snapshots and the server-side
// preview worker (lib/src/drawing/note-markers.ts); what lives here is the
// per-frame rendering — texture caching, sprite pooling and the selection
// ring, none of which a one-shot render needs.

// One resolved marker (position + sprite + tint), indexed like the raw notes.
interface PreparedMarker {
  x: number;
  y: number;
  marker: MarkerName;
  color: number;
  alpha: number;
}

// The five marker textures never change at runtime, so they're resolved once
// per DrawPixi instance (module-level, keyed by marker name) rather than
// per-overlay-instance or per-note.
const textureCache = new WeakMap<DrawPixi, Record<MarkerName, any>>();
function getMarkerTextures(drawPixi: DrawPixi): Record<MarkerName, any> {
  let textures = textureCache.get(drawPixi);
  if (textures == null) {
    textures = {} as Record<MarkerName, any>;
    for (const name of Object.keys(MARKER_URLS) as MarkerName[])
      textures[name] = drawPixi.getNewBaseTexture(MARKER_URLS[name]);
    textureCache.set(drawPixi, textures);
  }
  return textures;
}

// Renders world-note marker sprites above buildings: a single Graphics for
// the selection ring (recomputed per frame for the camera transform) plus
// pooled, per-frame-scaled marker sprites (create-once, mutate-per-frame —
// the same pattern as DrawMiniUi / the scissors-tool cursor).
export class DrawNotesOverlay {
  private container: any;
  private graphics: any;
  private sprites: any[] = [];
  private textures: Record<MarkerName, any>;

  private lastNotes: BniWorldNote[] | null = null;
  private prepared: PreparedMarker[] = [];

  // `parent` defaults to the live app stage (the editor canvas and the
  // forceSize embed route both render there via the drawAll ticker loop).
  // The off-screen export snapshots (updateThumbnail/saveImages) pass their
  // own scratch `exportCamera.container` instead, since that's the container
  // actually captured to a texture — the app stage is never in that render.
  constructor(
    private drawPixi: DrawPixi,
    parent: any = drawPixi.pixiApp.stage,
  ) {
    this.container = drawPixi.getNewContainer();
    this.graphics = drawPixi.getNewGraphics();
    this.container.addChild(this.graphics);
    // Added after the room overlay/blueprint items, so notes sit on top of
    // everything (the game's front-most layer — in front of buildings).
    parent.addChild(this.container);
    this.textures = getMarkerTextures(drawPixi);
  }

  clear() {
    if (!this.container.visible) return;
    this.container.visible = false;
    this.graphics.clear();
  }

  draw(
    notes: BniWorldNote[] | null | undefined,
    camera: CameraService,
    selected?: BniWorldNote | null,
  ) {
    if (notes == null || notes.length === 0) {
      this.clear();
      this.lastNotes = notes ?? null;
      return;
    }

    this.container.visible = true;
    this.graphics.clear();

    if (notes !== this.lastNotes) {
      this.lastNotes = notes;
      this.prepared = notes.map((n) => {
        const resolve = (tag: number) => BuildableElement.getElementByTag(tag);
        const c = noteBadgeColor(n, resolve);
        return {
          x: n.x,
          y: n.y,
          marker: noteMarkerSprite(n, resolve),
          color: c.color,
          alpha: c.alpha,
        };
      });
      this.syncSprites();
    }

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;
    const size = NOTE_ICON_TILE_FRACTION * zoom;

    for (let i = 0; i < this.prepared.length; i++) {
      const note = this.prepared[i];
      // Cell centre, matching BlueprintItem.drawPixi's +0.5 convention.
      const screenX = (note.x + offset.x + 0.5) * zoom;
      const screenY = (offset.y - note.y + 0.5) * zoom;

      // Highlight ring behind the marker for the note being edited.
      if (selected != null && selected.x === note.x && selected.y === note.y) {
        this.graphics.lineStyle(Math.max(2, 0.07 * zoom), 0xffffff, 1);
        this.graphics.drawCircle(screenX, screenY, size * 0.62);
      }

      const sprite = this.sprites[i];
      if (sprite != null) {
        sprite.texture = this.textures[note.marker];
        sprite.tint = note.color;
        sprite.alpha = note.alpha;
        sprite.width = size;
        sprite.height = size;
        sprite.x = screenX;
        sprite.y = screenY;
      }
    }
  }

  // One marker sprite per note, indexed like this.prepared. The pool is never
  // truncated: entries beyond the current note count are hidden (kept for
  // reuse) so sprites never leak as orphaned container children when the
  // note set shrinks.
  private syncSprites() {
    for (let i = 0; i < this.prepared.length; i++) {
      let sprite = this.sprites[i];
      if (sprite == null) {
        sprite = this.drawPixi.getSpriteFrom(
          this.textures[this.prepared[i].marker],
        );
        sprite.anchor.set(0.5, 0.5);
        this.container.addChild(sprite);
        this.sprites[i] = sprite;
      }
      sprite.visible = true;
    }
    for (let i = this.prepared.length; i < this.sprites.length; i++)
      this.sprites[i].visible = false;
  }
}
