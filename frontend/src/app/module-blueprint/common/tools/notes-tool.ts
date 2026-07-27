import { Injectable } from "@angular/core";
import {
  BniWorldNote,
  BuildableElement,
  CameraService,
  DrawHelpers,
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

const CURSOR_URL = "assets/images/notes/add-note.png";
// The cursor art sits smaller than the marker preview and offset above it,
// echoing the mod's own placement cursor rather than fully covering the pin.
const CURSOR_TILE_FRACTION = 0.45;
const PREVIEW_ALPHA = 0.55;

// Note Creation Tool (spec/element-notes.md §6). Places text or element
// world notes on click. Modelled on PlanningTool: single-click mutation,
// exclusive within toolGroup 1, right-click/Escape return to Select.
@Injectable({ providedIn: "root" })
export class NotesTool implements ITool {
  parent!: ToolService;

  mode: "text" | "element" = "text";
  // "RRGGBBAA" tint applied to newly placed text notes, same shape as
  // BniWorldNote.tinthex (note-edit-panel's palette default).
  pendingTint = "ffffffff";
  // Shared, in place, with the reused ElementNoteEditorComponent — it
  // mutates id/mass/temp directly via two-way bindings (spec §6, §7). x/y/
  // type are placeholders; only id/mass/temp are read before placement.
  pendingElementNote: BniWorldNote = { x: 0, y: 0, type: 1 };

  private hoverTile: Vector2 | null = null;
  private preview: PIXI.Sprite | null = null;
  private cursorIcon: PIXI.Sprite | null = null;

  constructor(
    private blueprintService: BlueprintService,
    private worldNoteService: WorldNoteService,
  ) {}

  private buildPendingNote(position: Vector2): BniWorldNote {
    if (this.mode === "text")
      return {
        x: position.x,
        y: position.y,
        type: 0,
        title: "",
        text: "",
        tinthex: this.pendingTint,
      };
    return {
      x: position.x,
      y: position.y,
      type: 1,
      id: this.pendingElementNote.id,
      mass: this.pendingElementNote.mass,
      temp: this.pendingElementNote.temp,
    };
  }

  switchFrom() {
    this.hoverTile = null;
    if (this.preview != null) this.preview.visible = false;
    if (this.cursorIcon != null) this.cursorIcon.visible = false;
  }
  switchTo() {}
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

  private previewNote(): BniWorldNote {
    return this.mode === "text"
      ? { x: 0, y: 0, type: 0, tinthex: this.pendingTint }
      : { x: 0, y: 0, type: 1, id: this.pendingElementNote.id };
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
    const note = this.previewNote();
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

  private updateCursorIcon(drawPixi: DrawPixi, camera: CameraService) {
    let icon = this.cursorIcon;
    if (icon == null) {
      icon = drawPixi.getSpriteFrom(CURSOR_URL) as PIXI.Sprite;
      icon.anchor.set(0.5, 1);
      drawPixi.pixiApp.stage.addChild(icon);
      this.cursorIcon = icon;
    }
    icon.visible = this.hoverTile != null;
    if (!icon.visible) return;

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;
    const markerSize = NOTE_ICON_TILE_FRACTION * zoom;
    icon.width = CURSOR_TILE_FRACTION * zoom;
    icon.height = CURSOR_TILE_FRACTION * zoom;
    icon.x = (this.hoverTile!.x + offset.x + 0.5) * zoom;
    icon.y = (offset.y - this.hoverTile!.y + 0.5) * zoom - markerSize * 0.5;
  }

  draw(drawPixi: DrawPixi, camera: CameraService) {
    this.updatePreview(drawPixi, camera);
    this.updateCursorIcon(drawPixi, camera);
  }

  toggleable = false;
  visible = false;
  captureInput = true;
  toolType = ToolType.notes;
  toolGroup = 1;
}
