import {
  BniWorldNote,
  BuildableElement,
  CameraService,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// BlueprintsV2 world notes come across as pins on cells: text annotations
// (type 0, a tinted title/body) and element notes (type 1, an element +
// mass/temperature). In game each is a cell-sized "i" indicator on its own
// top layer that you click to read (spec/blueprintsv2-samples/blueprint-ui.png);
// this overlay reproduces the icon, and the canvas handles the click-to-read.
const TEXT_NOTE = 0;

// Fallback badge colour for element notes whose element/uiColor we can't
// resolve, and for any text note missing a usable tint.
const DEFAULT_BADGE_COLOR = 0x3b82f6;

// Icon geometry, all relative to the cell (zoom = px per cell) so the badge
// fills its tile at every zoom, matching the game.
const BADGE_RADIUS_FRACTION = 0.42;
const BADGE_OUTLINE_FRACTION = 0.045;
const GLYPH_HEIGHT_FRACTION = 0.8;
const BADGE_OUTLINE = 0x101010;

// The "i" is rasterized once at this size and scaled per frame (cheaper than
// restyling text every frame); high enough to stay crisp at max zoom (128).
const GLYPH_BASE_FONT = 110;
const GLYPH_STYLE = {
  fontFamily: "Arial",
  fontSize: GLYPH_BASE_FONT,
  fontStyle: "italic",
  fontWeight: "bold",
  fill: "#ffffff",
  stroke: "#000000",
  strokeThickness: 12,
  align: "center",
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

// Display-ready note for the click-to-read popup.
export interface WorldNoteContent {
  kind: "text" | "element";
  title: string;
  body: string; // text notes only
  detail: string; // element notes only (mass / temperature)
  colorCss: string; // "#rrggbb" for the popup swatch
  cell: { x: number; y: number };
}

export function resolveNoteContent(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined,
): WorldNoteContent {
  const { color } = noteBadgeColor(note, resolveElement);
  const colorCss =
    "#" + ((color >>> 0) & 0xffffff).toString(16).padStart(6, "0");
  const cell = { x: note.x, y: note.y };

  if (note.type === TEXT_NOTE) {
    return {
      kind: "text",
      title: stripNoteMarkup(note.title ?? "") || "Note",
      body: stripNoteMarkup(note.text ?? ""),
      detail: "",
      colorCss,
      cell,
    };
  }

  const element = note.id != null ? resolveElement(note.id) : undefined;
  return {
    kind: "element",
    title: element != null ? stripNoteMarkup(element.name) : "Unknown element",
    body: "",
    detail: formatElementDetail(note.mass, note.temp),
    colorCss,
    cell,
  };
}

// "791.8 kg · 23.0 °C" from the note's mass (kg) and temperature (Kelvin).
function formatElementDetail(
  mass: number | undefined,
  tempKelvin: number | undefined,
): string {
  const parts: string[] = [];
  if (mass != null) parts.push(`${roundTo(mass, 1)} kg`);
  if (tempKelvin != null) parts.push(`${roundTo(tempKelvin - 273.15, 1)} °C`);
  return parts.join(" · ");
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
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

// One resolved badge (position + colour), indexed like the raw notes.
interface PreparedBadge {
  x: number;
  y: number;
  color: number;
  alpha: number;
}

// Renders world-note icons above buildings, mirroring DrawRoomOverlay's
// approach: a single Graphics for the cell-sized badges (recomputed per frame
// for the camera transform) plus pooled, per-frame-scaled "i" glyphs.
export class DrawNotesOverlay {
  private container: any;
  private graphics: any;
  private glyphs: any[] = [];

  private lastNotes: BniWorldNote[] | null = null;
  private prepared: PreparedBadge[] = [];

  constructor(private drawPixi: DrawPixi) {
    this.container = drawPixi.getNewContainer();
    this.graphics = drawPixi.getNewGraphics();
    this.container.addChild(this.graphics);
    // Added to the stage after the room overlay, so notes sit on top of
    // everything (the game's front-most layer — in front of buildings).
    drawPixi.pixiApp.stage.addChild(this.container);
  }

  clear() {
    if (!this.container.visible) return;
    this.container.visible = false;
    this.graphics.clear();
  }

  draw(notes: BniWorldNote[] | null | undefined, camera: CameraService) {
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
        const c = noteBadgeColor(n, (tag) =>
          BuildableElement.getElementByTag(tag),
        );
        return { x: n.x, y: n.y, color: c.color, alpha: c.alpha };
      });
      this.syncGlyphs();
    }

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;
    const radius = BADGE_RADIUS_FRACTION * zoom;
    const outline = Math.max(1, BADGE_OUTLINE_FRACTION * zoom);
    const glyphScale = (GLYPH_HEIGHT_FRACTION * zoom) / GLYPH_BASE_FONT;

    for (let i = 0; i < this.prepared.length; i++) {
      const note = this.prepared[i];
      // Cell centre, matching BlueprintItem.drawPixi's +0.5 convention.
      const screenX = (note.x + offset.x + 0.5) * zoom;
      const screenY = (offset.y - note.y + 0.5) * zoom;

      this.graphics.lineStyle(outline, BADGE_OUTLINE, 1);
      this.graphics.beginFill(note.color, note.alpha);
      this.graphics.drawCircle(screenX, screenY, radius);
      this.graphics.endFill();

      const glyph = this.glyphs[i];
      if (glyph != null) {
        glyph.x = screenX;
        glyph.y = screenY;
        glyph.scale.set(glyphScale);
      }
    }
  }

  // One "i" glyph per note, indexed like this.prepared. The pool is never
  // truncated: entries beyond the current note count are hidden (kept for
  // reuse) so glyphs never leak as orphaned container children when the note
  // set shrinks.
  private syncGlyphs() {
    for (let i = 0; i < this.prepared.length; i++) {
      let glyph = this.glyphs[i];
      if (glyph == null) {
        glyph = this.drawPixi.getNewText("i", GLYPH_STYLE);
        glyph.anchor.set(0.5, 0.5);
        this.container.addChild(glyph);
        this.glyphs[i] = glyph;
      }
      glyph.visible = true;
    }
    for (let i = this.prepared.length; i < this.glyphs.length; i++)
      this.glyphs[i].visible = false;
  }
}
