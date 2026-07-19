import { Injectable } from "@angular/core";
import {
  BniPlanShape,
  CameraService,
  DrawHelpers,
  Vector2,
} from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import { DrawPixi } from "../../drawing/draw-pixi";
import { drawPlanningShape } from "../../drawing/draw-planning-overlay";
import { ITool, ToolType } from "./tool";
import { ToolService } from "../../services/tool-service";

@Injectable({ providedIn: "root" })
export class PlanningTool implements ITool {
  parent!: ToolService;
  shape = 0;
  color = 1;
  erase = false;
  private hoverTile: Vector2 | null = null;
  private preview: PIXI.Graphics | null = null;

  constructor(private blueprintService: BlueprintService) {}

  private apply(tile: Vector2) {
    const position = DrawHelpers.getIntegerTile(tile);
    const plans = this.blueprintService.blueprint.planningToolShapes;
    const existing = plans.findIndex(
      (plan) => plan.x === position.x && plan.y === position.y,
    );

    if (this.erase) {
      if (existing < 0) return;
      plans.splice(existing, 1);
    } else {
      const plan: BniPlanShape = {
        x: position.x,
        y: position.y,
        shape: this.shape,
        color: this.color,
      };
      if (
        existing >= 0 &&
        plans[existing].shape === plan.shape &&
        plans[existing].color === plan.color
      )
        return;
      if (existing >= 0) plans[existing] = plan;
      else plans.push(plan);
    }
    this.blueprintService.blueprint.emitBlueprintChanged();
  }

  switchFrom() {
    this.hoverTile = null;
    if (this.preview != null) this.preview.visible = false;
  }
  switchTo() {}
  mouseOut() {
    this.hoverTile = null;
  }
  mouseDown(tile: Vector2) {
    this.apply(tile);
  }
  leftClick(_tile: Vector2) {}
  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }
  hover(tile: Vector2) {
    this.hoverTile = DrawHelpers.getIntegerTile(tile);
  }
  drag(_tileStart: Vector2, tileStop: Vector2) {
    this.hoverTile = DrawHelpers.getIntegerTile(tileStop);
    this.apply(tileStop);
  }
  dragStop() {}
  keyDown(_keyCode: string) {}

  draw(drawPixi: DrawPixi, camera: CameraService) {
    let preview = this.preview;
    if (preview == null) {
      const created = drawPixi.getNewGraphics() as PIXI.Graphics;
      drawPixi.pixiApp.stage.addChild(created);
      this.preview = created;
      preview = created;
    }
    preview.clear();
    preview.visible = this.hoverTile != null && !this.erase;
    if (preview.visible)
      drawPlanningShape(
        preview,
        { ...this.hoverTile!, shape: this.shape, color: this.color },
        camera,
        0.55,
      );
  }

  toggleable = false;
  visible = false;
  captureInput = true;
  toolType = ToolType.planning;
  toolGroup = 1;
}
