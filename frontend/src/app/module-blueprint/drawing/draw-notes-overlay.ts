import {
  BniWorldNote,
  BuildableElement,
  CameraService,
} from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

// BlueprintsV2 world notes come across as pins on cells: text annotations
// (type 0, a tinted title/body) and element notes (type 1, an element +
// mass/temperature). The mod's own preview renders each as a small "i"
// indicator on the cell (spec/blueprintsv2-samples/blueprint-ui.png); this
// overlay reproduces that in the editor.
const TEXT_NOTE = 0;

// Fallback badge colour for element notes whose element/uiColor we can't
// resolve, and for any text note missing a usable tint.
const DEFAULT_BADGE_COLOR = 0x3b82f6;

const BADGE_RADIUS_PX = 11;
const BADGE_OUTLINE = 0x101010;

const GLYPH_STYLE = {
  fontFamily: "Arial",
  fontSize: 15,
  fontStyle: "italic",
  fontWeight: "bold",
  fill: "#ffffff",
  stroke: "#000000",
  strokeThickness: 2,
  align: "center",
};

const LABEL_STYLE = {
  fontFamily: "Arial",
  fontSize: 12,
  fill: "#ffffff",
  stroke: "#000000",
  strokeThickness: 3,
  align: "center",
};

// One resolved, display-ready note (text stripped of ONI rich-text markup).
export interface PreparedNote {
  x: number;
  y: number;
  color: number;
  alpha: number;
  label: string;
}

// "RRGGBBAA" (the mod's Color.ToHexString) -> PIXI colour + alpha. Anything
// unparseable falls back to the default badge colour, fully opaque.
export function parseNoteTintHex(hex: string | undefined): {
  color: number;
  alpha: number;
} {
  if (hex == null || !/^[0-9a-fA-F]{6,8}$/.test(hex))
    return { color: DEFAULT_BADGE_COLOR, alpha: 1 };
  const color = parseInt(hex.slice(0, 6), 16);
  const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { color, alpha };
}

// ONI stores rich-text markup in note strings (spec §7 gotcha 2); strip it
// before showing. Also collapse whitespace and cap length so a long note
// can't dominate the canvas.
export function stripNoteMarkup(text: string): string {
  const stripped = text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 40 ? stripped.slice(0, 39) + "…" : stripped;
}

// Resolve a raw world note to display fields. Element lookup is injected so
// this stays a pure, unit-testable function independent of global state.
export function prepareWorldNote(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined,
): PreparedNote {
  if (note.type === TEXT_NOTE) {
    const tint = parseNoteTintHex(note.tinthex);
    return {
      x: note.x,
      y: note.y,
      color: tint.color,
      alpha: tint.alpha,
      label: stripNoteMarkup(note.title ?? note.text ?? ""),
    };
  }

  // Element note: colour the badge by the element and label it with the
  // element name; fall back gracefully when the tag is unknown (modded).
  const element = note.id != null ? resolveElement(note.id) : undefined;
  const color =
    element != null && element.uiColor ? element.uiColor : DEFAULT_BADGE_COLOR;
  return {
    x: note.x,
    y: note.y,
    color,
    alpha: 1,
    label: element != null ? stripNoteMarkup(element.name) : "",
  };
}

// Renders world-note pins above buildings, mirroring DrawRoomOverlay's
// approach: a single Graphics for the badges (recomputed per frame for the
// camera transform) plus pooled PIXI.Text objects for the "i" glyph and the
// note label, which only change when the note set changes.
export class DrawNotesOverlay {
  private container: any;
  private graphics: any;
  private glyphs: any[] = [];
  private labels: any[] = [];

  private lastNotes: BniWorldNote[] | null = null;
  private prepared: PreparedNote[] = [];

  constructor(private drawPixi: DrawPixi) {
    this.container = drawPixi.getNewContainer();
    this.graphics = drawPixi.getNewGraphics();
    this.container.addChild(this.graphics);
    // Added to the stage after the room overlay, so notes sit on top of
    // everything (they are the game's front-most FX layer too).
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
      this.prepared = notes.map((n) =>
        prepareWorldNote(n, (tag) => BuildableElement.getElementByTag(tag)),
      );
      this.syncText();
    }

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;

    for (let i = 0; i < this.prepared.length; i++) {
      const note = this.prepared[i];
      // Cell centre, matching BlueprintItem.drawPixi's +0.5 convention.
      const screenX = (note.x + offset.x + 0.5) * zoom;
      const screenY = (offset.y - note.y + 0.5) * zoom;

      this.graphics.lineStyle(2, BADGE_OUTLINE, 1);
      this.graphics.beginFill(note.color, note.alpha);
      this.graphics.drawCircle(screenX, screenY, BADGE_RADIUS_PX);
      this.graphics.endFill();

      const glyph = this.glyphs[i];
      if (glyph != null) {
        glyph.x = screenX;
        glyph.y = screenY;
      }
      const label = this.labels[i];
      if (label != null) {
        label.x = screenX;
        label.y = screenY + BADGE_RADIUS_PX + 2;
      }
    }
  }

  // One "i" glyph and one label per note, indexed like this.prepared. Pooled
  // so restyling text (which re-rasterizes) only happens when notes change.
  private syncText() {
    for (const g of this.glyphs) g.visible = false;
    for (const l of this.labels) l.visible = false;

    const glyphs: any[] = [];
    const labels: any[] = [];

    for (let i = 0; i < this.prepared.length; i++) {
      const note = this.prepared[i];

      let glyph = this.glyphs[i];
      if (glyph == null) {
        glyph = this.drawPixi.getNewText("i", GLYPH_STYLE);
        glyph.anchor.set(0.5, 0.5);
        this.container.addChild(glyph);
      }
      glyph.visible = true;
      glyphs.push(glyph);

      let label = this.labels[i];
      if (label == null) {
        label = this.drawPixi.getNewText(note.label, LABEL_STYLE);
        label.anchor.set(0.5, 0);
        this.container.addChild(label);
      } else if (label.text !== note.label) label.text = note.label;
      label.visible = note.label.length > 0;
      labels.push(label);
    }

    this.glyphs = glyphs;
    this.labels = labels;
  }
}
