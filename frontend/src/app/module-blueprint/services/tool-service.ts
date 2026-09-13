import { Injectable } from "@angular/core";
import { ToolType, ITool, IChangeTool } from "../common/tools/tool";
import { SelectTool } from "../common/tools/select-tool";
import {
  BlueprintHelpers,
  BlueprintItem,
  BniWorldNote,
  CameraService,
  Overlay,
  Vector2,
} from "../../../../../lib/index";
import {
  ShortcutAction,
  ShortcutActionId,
} from "../keybindings/shortcut-actions";
import { DrawPixi } from "../drawing/draw-pixi";
import { BuildTool } from "../common/tools/build-tool";
import { ElementReport } from "../common/tools/element-report";
import { ScissorsTool } from "../common/tools/scissors-tool";
import { PlanningTool } from "../common/tools/planning-tool";
import { NotesTool } from "../common/tools/notes-tool";
import { TerrainTool } from "../common/tools/terrain-tool";
import { BlueprintService } from "./blueprint-service";
import { WorldNoteService, findNoteAt } from "./world-note.service";

// The mod's `BlueprintNoteData.NoteType.Element`.
const ELEMENT_NOTE = 1;

@Injectable({ providedIn: "root" })
export class ToolService implements ITool, IChangeTool {
  private allTools: ITool[];
  private currentTool: ITool;
  // The last tile the mouse hovered, tracked here (not per-tool) so a
  // keyboard-only action like the "B" sample-under-cursor shortcut can read
  // it regardless of which tool is currently active.
  private lastHoverTile: Vector2 | null = null;

  // This is used by the menu to get the visible status of the tools
  public getTool(toolType: ToolType) {
    return this.allTools.filter((t) => {
      return t.toolType == toolType;
    })[0];
  }

  private observers: IObsToolChanged[];

  constructor(
    public selectTool: SelectTool,
    public buildTool: BuildTool,
    public elementReport: ElementReport,
    public scissorsTool: ScissorsTool,
    public planningTool: PlanningTool,
    public notesTool: NotesTool,
    public terrainTool: TerrainTool,
    private blueprintService: BlueprintService,
    private worldNoteService: WorldNoteService,
  ) {
    this.observers = [];

    this.currentTool = this.selectTool;

    this.allTools = [];
    this.allTools.push(this.selectTool);
    this.allTools.push(this.buildTool);
    this.allTools.push(this.scissorsTool);
    this.allTools.push(this.planningTool);
    this.allTools.push(this.notesTool);
    this.allTools.push(this.terrainTool);

    this.buildTool.parent = this;
    this.selectTool.parent = this;
    this.scissorsTool.parent = this;
    this.planningTool.parent = this;
    this.notesTool.parent = this;
    this.terrainTool.parent = this;
  }

  subscribeToolChanged(observer: IObsToolChanged) {
    this.observers.push(observer);
  }

  changeTool(newTool: ToolType) {
    const newToolInstance = this.getTool(newTool);

    // Iterate over every tool of the same group
    // Switch from and make invisible if needed
    this.allTools
      .filter((t) => {
        return (
          t.toolGroup == newToolInstance.toolGroup &&
          t.toolType != newToolInstance.toolType
        );
      })
      .map((t) => {
        if (t.visible) {
          t.switchFrom();
          t.visible = false;
        }
      });

    if (newToolInstance.captureInput) this.currentTool = newToolInstance;

    if (newToolInstance.toggleable && newToolInstance.visible) {
      newToolInstance.visible = false;
      newToolInstance.switchFrom();
    } else {
      newToolInstance.visible = true;
      newToolInstance.switchTo();
    }

    this.observers.map((observer) => observer.toolChanged(newTool));
  }

  // Tool interface
  switchFrom() {}

  switchTo() {}

  mouseOut() {
    this.currentTool.mouseOut();
  }
  mouseDown(tile: Vector2, tileFloat?: Vector2) {
    this.currentTool.mouseDown(tile, tileFloat);
  }
  leftClick(tile: Vector2) {
    this.currentTool.leftClick(tile);
  }
  rightClick(tile: Vector2) {
    this.currentTool.rightClick(tile);
  }
  hover(tile: Vector2) {
    this.lastHoverTile = tile;
    this.currentTool.hover(tile);
  }
  drag(tileStart: Vector2, tileStop: Vector2) {
    this.currentTool.drag(tileStart, tileStop);
  }
  dragStop() {
    this.currentTool.dragStop();
  }
  // Scissors only makes sense while looking at a connectable overlay
  // (Power/Plumbing/Ventilation/etc) - there's nothing to cut on Buildings/None.
  get scissorsDisabled(): boolean {
    if (CameraService.cameraService == null) return true;
    const overlay = CameraService.cameraService.overlay;
    return overlay == Overlay.Base || overlay == Overlay.None;
  }

  // Mirrors the game's "Copy Building": switch to the build tool, and if
  // something is selected, load a copy of it as the brush. With nothing
  // selected — the common case, since entering the build tool deselects —
  // this instead samples whatever is under the cursor: a building or element
  // cell clones into the build tool exactly like a selection would, and an
  // element world note switches to the notes tool with that note as the
  // pending brush. A selected world note is checked before the hover tile,
  // mirroring the selected-building rule.
  changeToBuildToolFromSelection() {
    const selected = this.selectTool.selectedItem;
    if (selected != null) {
      const copy = BlueprintHelpers.cloneBlueprintItem(selected);
      this.changeTool(ToolType.build);
      this.buildTool.changeItem(copy);
      return;
    }

    const selectedNote = this.worldNoteService.selected;
    if (selectedNote != null && selectedNote.type === ELEMENT_NOTE) {
      this.sampleElementNoteIntoNotesTool(selectedNote);
      return;
    }

    const hoverTile = this.lastHoverTile;
    if (hoverTile != null) {
      const item = this.frontmostBlueprintItemAt(hoverTile);
      if (item != null) {
        const copy = BlueprintHelpers.cloneBlueprintItem(item);
        this.changeTool(ToolType.build);
        this.buildTool.changeItem(copy);
        return;
      }

      const note = findNoteAt(
        this.blueprintService.blueprint.worldNotes,
        hoverTile,
      );
      if (note != null && note.type === ELEMENT_NOTE) {
        this.sampleElementNoteIntoNotesTool(note);
        return;
      }
    }

    this.changeTool(ToolType.build);
  }

  // The frontmost real blueprint item at a tile — same "highest depth wins"
  // rule SelectTool.selectFromBox uses, so B samples whichever of a building
  // and an element cell sharing a tile the current overlay would select.
  private frontmostBlueprintItemAt(tile: Vector2): BlueprintItem | null {
    const items = this.blueprintService.blueprint.getBlueprintItemsAt(tile);
    if (items.length === 0) return null;
    return items.reduce((front, item) =>
      item.depth > front.depth ? item : front,
    );
  }

  // Sets the pending note's fields before flipping the mode: NotesTool's mode
  // setter seeds a default element only when none is set yet, so writing
  // id/mass/temp first makes that seed a no-op and the sampled values stick.
  private sampleElementNoteIntoNotesTool(note: BniWorldNote) {
    this.notesTool.pendingElementNote = {
      ...this.notesTool.pendingElementNote,
      id: note.id,
      mass: note.mass,
      temp: note.temp,
    };
    this.notesTool.mode = "element";
    this.changeTool(ToolType.notes);
  }

  // Tool-scoped shortcuts: tool switching is handled here, everything else is
  // offered to whichever tool currently owns the input.
  handleShortcut(action: ShortcutActionId): boolean {
    switch (action) {
      case ShortcutAction.toolSelect:
        this.changeTool(ToolType.select);
        return true;
      case ShortcutAction.toolBuild:
        this.changeToBuildToolFromSelection();
        return true;
      case ShortcutAction.toolPlanning:
        this.changeTool(ToolType.planning);
        return true;
      case ShortcutAction.toolScissors:
        if (this.scissorsDisabled) return false;
        this.changeTool(ToolType.scissors);
        return true;
      case ShortcutAction.toolTerrain:
        this.changeTool(ToolType.terrain);
        return true;
      case ShortcutAction.toolNotes:
        this.changeTool(ToolType.notes);
        return true;
      default:
        return this.currentTool.handleShortcut(action);
    }
  }
  draw(drawPixi: DrawPixi, camera: CameraService) {
    this.currentTool.draw(drawPixi, camera);
  }

  // These should never be used
  toggleable!: boolean;
  visible!: boolean;
  captureInput!: boolean;
  toolType!: ToolType;
  toolGroup!: number;
}

export class ToolRequest {
  toolType!: ToolType;
  templateItem!: BlueprintItem;
}

export interface IObsToolChanged {
  toolChanged(toolType: ToolType): void;
}
