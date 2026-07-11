import { CameraService, Vector2 } from "../../../../../../lib/index";
import { DrawPixi } from "../../drawing/draw-pixi";

export enum ToolType {
  select,
  build,
  elementReport,
  scissors,
}

export interface ITool {
  switchFrom(): void;
  switchTo(): void;

  // Input
  leftClick(tile: Vector2): void;
  rightClick(tile: Vector2): void;
  // tileFloat carries the sub-tile cursor position (unrounded), needed by tools
  // that resolve a click to a zone within the tile rather than the whole tile.
  mouseDown(tile: Vector2, tileFloat?: Vector2): void;
  mouseOut(): void;
  hover(tile: Vector2): void;
  drag(tileStart: Vector2, tileStop: Vector2): void;
  dragStop(): void;
  keyDown(keyCode: string): void;
  draw(drawPixi: DrawPixi, camera: CameraService): void;

  // Tool switching
  toggleable: boolean; // Can we close this tool by clicking on it a second time
  visible: boolean; // Can we see this tool? Also use to set to check icon in menu
  captureInput: boolean; // Can this tool capture canvas mouse and keyboard input
  toolType: ToolType; // Each tool is aware of its nature
  toolGroup: number; // All tools with the same number are exclusive
}

export interface IChangeTool {
  changeTool(toolType: ToolType): void;
}
