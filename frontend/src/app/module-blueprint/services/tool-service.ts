import { Injectable } from "@angular/core";
import { ToolType, ITool, IChangeTool } from "../common/tools/tool";
import { SelectTool } from "../common/tools/select-tool";
import {
  BlueprintItem,
  CameraService,
  Vector2,
} from "../../../../../lib/index";
import { DrawPixi } from "../drawing/draw-pixi";
import { BuildTool } from "../common/tools/build-tool";
import { ElementReport } from "../common/tools/element-report";
import { ScissorsTool } from "../common/tools/scissors-tool";

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
    public scissorsTool: ScissorsTool
  ) {
    this.observers = [];

    this.currentTool = this.selectTool;

    this.allTools = [];
    this.allTools.push(this.selectTool);
    this.allTools.push(this.buildTool);
    this.allTools.push(this.scissorsTool);

    this.buildTool.parent = this;
    this.selectTool.parent = this;
    this.scissorsTool.parent = this;
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
  keyDown(keyCode: string) {
    // TODO This is hacky, but when I press B on the info icons, the UI changes tool.
    // I have to figure out a way of suppressing key presses when in a text area
    // if (keyCode == 'b' && this.currentTool.toolType != ToolType.build)
    //   this.changeTool(ToolType.build);
    this.currentTool.keyDown(keyCode);
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
