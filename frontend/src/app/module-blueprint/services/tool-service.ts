import { Injectable } from "@angular/core";
import { ToolType, ITool, IChangeTool } from "../common/tools/tool";
import { SelectTool } from "../common/tools/select-tool";
import {
  BlueprintHelpers,
  BlueprintItem,
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

@Injectable({ providedIn: "root" })
export class ToolService implements ITool, IChangeTool {
  private allTools: ITool[];
  private currentTool: ITool;

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
  ) {
    this.observers = [];

    this.currentTool = this.selectTool;

    this.allTools = [];
    this.allTools.push(this.selectTool);
    this.allTools.push(this.buildTool);
    this.allTools.push(this.scissorsTool);
    this.allTools.push(this.planningTool);
    this.allTools.push(this.notesTool);

    this.buildTool.parent = this;
    this.selectTool.parent = this;
    this.scissorsTool.parent = this;
    this.planningTool.parent = this;
    this.notesTool.parent = this;
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
  // something is selected, load a copy of it as the item to build.
  changeToBuildToolFromSelection() {
    const selected = this.selectTool.selectedItem;
    const copy =
      selected == null ? null : BlueprintHelpers.cloneBlueprintItem(selected);

    this.changeTool(ToolType.build);
    if (copy != null) this.buildTool.changeItem(copy);
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
