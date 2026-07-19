import { BniPlanShape, CameraService } from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";

export const PLANNING_COLORS = [
  0x808080, 0x4169e1, 0x32cd32, 0xe5533d, 0x55d6cf, 0xcf45cf, 0x914bc7,
  0xd99a42, 0xc8c83f, 0xd8d8d8, 0x22221c,
] as const;

const OUTLINE = 0x4a4134;

export function drawPlanningShape(
  graphics: any,
  plan: BniPlanShape,
  camera: CameraService,
  alpha = 0.9,
) {
  const zoom = camera.currentZoom;
  const centerX = (plan.x + camera.cameraOffset.x + 0.5) * zoom;
  const centerY = (camera.cameraOffset.y - plan.y + 0.5) * zoom;
  const radius = zoom * 0.39;

  graphics.lineStyle(Math.max(1, zoom * 0.035), OUTLINE, alpha);
  graphics.beginFill(PLANNING_COLORS[plan.color] ?? PLANNING_COLORS[0], alpha);
  if (plan.shape === 1) {
    graphics.drawCircle(centerX, centerY, radius);
  } else if (plan.shape === 2) {
    graphics.drawPolygon([
      centerX,
      centerY - radius,
      centerX + radius,
      centerY,
      centerX,
      centerY + radius,
      centerX - radius,
      centerY,
    ]);
  } else {
    graphics.drawRoundedRect(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
      zoom * 0.035,
    );
  }
  graphics.endFill();
}

/** Cell-sized decorative markers written by the Planning Tool mod. */
export class DrawPlanningOverlay {
  private graphics: any;

  constructor(drawPixi: DrawPixi) {
    this.graphics = drawPixi.getNewGraphics();
    drawPixi.pixiApp.stage.addChild(this.graphics);
  }

  draw(plans: BniPlanShape[] | null | undefined, camera: CameraService) {
    this.graphics.clear();
    this.graphics.visible = plans != null && plans.length > 0;
    if (!this.graphics.visible) return;
    for (const plan of plans!) drawPlanningShape(this.graphics, plan, camera);
  }
}
