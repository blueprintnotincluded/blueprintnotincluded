import {
  BniWorldNote,
  BuildableElement,
  CameraService,
  ElementState,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// BlueprintsV2 world notes come across as pins on cells: text annotations
// (type 0, a tinted title/body) and element notes (type 1, an element +
// mass/temperature). The mod renders each as a state-tinted marker sprite
// (spec/element-notes.md §4); this overlay reproduces that, and the canvas
// handles the click-to-read.
const TEXT_NOTE = 0;

// Fallback badge colour for element notes whose element/uiColor we can't
// resolve, and for any text note missing a usable tint.
const DEFAULT_BADGE_COLOR = 0x3b82f6;

// Marker art is bracket-framed and already reads as inset at full tile size,
// so it fills most (not all) of its cell (spec §5).
const NOTE_ICON_TILE_FRACTION = 0.9;

export type MarkerName = "note" | "solid" | "liquid" | "gas";

const MARKER_URLS: Record<MarkerName, string> = {
  note: "assets/images/notes/note.png",
  solid: "assets/images/notes/solid.png",
  liquid: "assets/images/notes/liquid.png",
  gas: "assets/images/notes/gas.png",
};

// Badge colour (PIXI int + alpha) for a note: text notes use their tint,
// element notes use the resolved element's uiColor. Element lookup is injected
// so this stays pure and unit-testable.
export function noteBadgeColor(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined,
): { color: number; alpha: number } {
  if (note.type === TEXT_NOTE) return parseNoteTintHex(note.tinthex);
  const element = note.id != null ? resolveElement(note.id) : undefined;
  return {
    color:
      element != null && element.uiColor
        ? element.uiColor
        : DEFAULT_BADGE_COLOR,
    alpha: 1,
  };
}

// "RRGGBBAA" (the mod's Color.ToHexString) -> PIXI colour + alpha. Anything
// unparseable falls back to the default badge colour, fully opaque.
export function parseNoteTintHex(hex: string | undefined): {
  color: number;
  alpha: number;
} {
  if (hex == null || !/^(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex))
    return { color: DEFAULT_BADGE_COLOR, alpha: 1 };
  const color = parseInt(hex.slice(0, 6), 16);
  const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { color, alpha };
}

// ONI stores rich-text markup in note strings (spec §7 gotcha 2); strip it
// before showing, and collapse whitespace.
export function stripNoteMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Which marker sprite a note renders as (spec §4 table). Element notes pick
// the sprite for the resolved element's state; unresolved elements and
// Vacuum fall back to the plain note marker, same as the default badge
// colour they also get from noteBadgeColor.
export function noteMarkerSprite(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined,
): MarkerName {
  if (note.type === TEXT_NOTE) return "note";
  const element = note.id != null ? resolveElement(note.id) : undefined;
  if (element == null) return "note";
  switch (element.state) {
    case ElementState.Solid:
      return "solid";
    case ElementState.Liquid:
      return "liquid";
    case ElementState.Gas:
      return "gas";
    default:
      return "note";
  }
}

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
