import { Injectable } from "@angular/core";
import {
  BniWorldNote,
  BuildableElement,
  CameraService,
  DrawHelpers,
  ElementState,
  Vector2,
} from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import {
  WorldNoteService,
  findNoteAt,
} from "../../services/world-note.service";
import { DrawPixi } from "../../drawing/draw-pixi";
import {
  MARKER_URLS,
  NOTE_ICON_TILE_FRACTION,
  noteBadgeColor,
  noteMarkerSprite,
} from "../../drawing/draw-notes-overlay";
import { ITool, ToolType } from "./tool";
import {
  ShortcutAction,
  ShortcutActionId,
} from "../../keybindings/shortcut-actions";
import { ToolService } from "../../services/tool-service";

const PREVIEW_ALPHA = 0.55;

// Element seeded into a fresh element note so the tool is placeable (and the
// side panel readable) the moment the mode is picked, instead of opening on
// "Unknown element" at absolute zero. Water is the most common thing an
// annotation points at; anything liquid does if the database lacks it.
const DEFAULT_ELEMENT_ID = "Water";

// Note Creation Tool (spec/element-notes.md §6). Places text or element
// world notes on click. Modelled on PlanningTool: single-click mutation,
// exclusive within toolGroup 1, right-click/Escape return to Select.
@Injectable({ providedIn: "root" })
export class NotesTool implements ITool {
  parent!: ToolService;

  private _mode: "text" | "element" = "text";
  get mode(): "text" | "element" {
    return this._mode;
  }
  set mode(value: "text" | "element") {
    this._mode = value;
    if (value === "element") this.seedPendingElement();
  }

  // The note the next click will place, one per mode. These are real
  // BniWorldNotes so the edit panel can bind to a pending note with exactly
  // the same controls it uses for a placed one — the panel is the only UI for
  // both (spec §6). They live outside blueprint.worldNotes, so editing them
  // never touches the blueprint or the undo ring. x/y are placeholders,
  // overwritten with the clicked tile on placement.
  pendingTextNote: BniWorldNote = {
    x: 0,
    y: 0,
    type: 0,
    title: "",
    text: "",
    tinthex: "ffffffff",
  };
  pendingElementNote: BniWorldNote = { x: 0, y: 0, type: 1 };

  get pendingNote(): BniWorldNote {
    return this.mode === "text"
      ? this.pendingTextNote
      : this.pendingElementNote;
  }

  private hoverTile: Vector2 | null = null;
  private preview: PIXI.Sprite | null = null;

  constructor(
    private blueprintService: BlueprintService,
    private worldNoteService: WorldNoteService,
  ) {}

  // Only fills a note that has no element yet, so switching modes back and
  // forth never discards the user's pick.
  private seedPendingElement() {
    if (this.pendingElementNote.id != null) return;
    const element =
      BuildableElement.elements?.find((e) => e.id === DEFAULT_ELEMENT_ID) ??
      BuildableElement.elements?.find((e) => e.state === ElementState.Liquid);
    if (element == null) return;
    this.pendingElementNote.id = element.tag;
    this.pendingElementNote.mass = element.defaultMass;
    this.pendingElementNote.temp = element.defaultTemperature;
  }

  // A copy, never the pending note itself: the pending note stays put as the
  // template for the next click.
  private buildPendingNote(position: Vector2): BniWorldNote {
    return { ...this.pendingNote, x: position.x, y: position.y };
  }

  switchFrom() {
    this.hoverTile = null;
    if (this.preview != null) this.preview.visible = false;
  }
  switchTo() {
    if (this.mode === "element") this.seedPendingElement();
  }
  mouseOut() {
    this.hoverTile = null;
  }
  mouseDown(tile: Vector2) {
    const position = DrawHelpers.getIntegerTile(tile);
    const blueprint = this.blueprintService.blueprint;
    const existing = findNoteAt(blueprint.worldNotes, position);
    if (existing != null) {
      this.worldNoteService.select(existing);
      return;
    }
    const note = this.buildPendingNote(position);
    blueprint.worldNotes.push(note);
    this.worldNoteService.select(note);
    this.worldNoteService.commit();
  }
  leftClick(_tile: Vector2) {}
  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }
  hover(tile: Vector2) {
    this.hoverTile = DrawHelpers.getIntegerTile(tile);
  }
  drag(_tileStart: Vector2, _tileStop: Vector2) {}
  dragStop() {}
  handleShortcut(action: ShortcutActionId): boolean {
    if (action == ShortcutAction.interfaceCancel) {
      this.parent.changeTool(ToolType.select);
      return true;
    }
    return false;
  }

  private updatePreview(drawPixi: DrawPixi, camera: CameraService) {
    let preview = this.preview;
    if (preview == null) {
      preview = drawPixi.getSpriteFrom(MARKER_URLS.note) as PIXI.Sprite;
      preview.anchor.set(0.5, 0.5);
      drawPixi.pixiApp.stage.addChild(preview);
      this.preview = preview;
    }
    preview.visible = this.hoverTile != null;
    if (!preview.visible) return;

    const resolve = (tag: number) => BuildableElement.getElementByTag(tag);
    const note = this.pendingNote;
    const marker = noteMarkerSprite(note, resolve);
    const badge = noteBadgeColor(note, resolve);
    preview.texture = drawPixi.getNewBaseTexture(MARKER_URLS[marker]);
    preview.tint = badge.color;
    preview.alpha = PREVIEW_ALPHA;

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;
    const size = NOTE_ICON_TILE_FRACTION * zoom;
    preview.width = size;
    preview.height = size;
    preview.x = (this.hoverTile!.x + offset.x + 0.5) * zoom;
    preview.y = (offset.y - this.hoverTile!.y + 0.5) * zoom;
  }

  // The translucent marker under the cursor is the whole placement cue — the
  // mod's separate "add note" badge floating above it read as a stray sprite
  // on the blueprint rather than as part of the cursor.
  draw(drawPixi: DrawPixi, camera: CameraService) {
    this.updatePreview(drawPixi, camera);
  }

  toggleable = false;
  visible = false;
  captureInput = true;
  toolType = ToolType.notes;
  toolGroup = 1;
}
