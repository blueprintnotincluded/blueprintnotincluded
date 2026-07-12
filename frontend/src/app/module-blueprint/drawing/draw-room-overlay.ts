import { CameraService, RoomDetectionResult } from "../../../../../lib/index";
import { DrawPixi } from "./draw-pixi";
import {
  buildRoomOverlayGeometry,
  CavityOverlayGeometry,
  TOO_LARGE_NOTICE,
} from "./room-overlay-geometry";

import {} from "pixi.js-legacy";
declare var PIXI: any;

const LABEL_STYLE = {
  fontFamily: "Arial",
  fontSize: 14,
  fill: "#ffffff",
  stroke: "#000000",
  strokeThickness: 3,
  align: "center",
};

// Renders the Room overlay: a translucent family-colored fill per detected
// cavity plus a room-name label, drawn above everything (like the game's F11
// view). Geometry is precomputed per detection result (room-overlay-geometry);
// each frame only redoes the camera transform. Labels are retained PIXI.Text
// objects pooled across results — restyling text every frame would re-rasterize.
export class DrawRoomOverlay {
  private container: any;
  private graphics: any;
  private labels: any[] = [];
  private notice: any = null;

  private lastResult: RoomDetectionResult | null = null;
  private geometry: CavityOverlayGeometry[] = [];

  constructor(private drawPixi: DrawPixi) {
    this.container = drawPixi.getNewContainer();
    this.graphics = drawPixi.getNewGraphics();
    this.container.addChild(this.graphics);
    // Stage children render in add order; the canvas adds this after
    // frontGraphics, so the overlay sits above items and tool feedback.
    drawPixi.pixiApp.stage.addChild(this.container);
  }

  clear() {
    if (!this.container.visible) return;
    this.container.visible = false;
    this.graphics.clear();
  }

  draw(result: RoomDetectionResult | null, camera: CameraService) {
    this.container.visible = true;
    this.graphics.clear();

    if (result !== this.lastResult) {
      this.lastResult = result;
      this.geometry = result != null ? buildRoomOverlayGeometry(result) : [];
      this.syncLabels();
    }

    if (result == null) return;

    if (result.status == "too-large") {
      this.drawTooLargeNotice();
      return;
    }
    if (this.notice != null) this.notice.visible = false;

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;

    for (let i = 0; i < this.geometry.length; i++) {
      const cavity = this.geometry[i];

      this.graphics.beginFill(cavity.color, cavity.alpha);
      for (const span of cavity.spans)
        this.graphics.drawRect(
          (span.x + offset.x) * zoom,
          (offset.y - span.y) * zoom,
          span.length * zoom,
          zoom
        );
      this.graphics.endFill();

      const label = this.labels[i];
      if (label != null) {
        label.x = (cavity.center.x + offset.x + 0.5) * zoom;
        label.y = (offset.y - cavity.center.y + 0.5) * zoom;
      }
    }
  }

  // One pooled PIXI.Text per labeled cavity, indexed like this.geometry
  // (null for unlabeled ones). Text content only changes here, never per frame.
  private syncLabels() {
    for (const label of this.labels) if (label != null) label.visible = false;

    const labels: any[] = [];
    let poolIndex = 0;
    const pool = this.labels.filter((l) => l != null);

    for (const cavity of this.geometry) {
      if (cavity.label == null) {
        labels.push(null);
        continue;
      }
      let label = pool[poolIndex++];
      if (label == null) {
        label = this.drawPixi.getNewText(cavity.label, LABEL_STYLE);
        label.anchor.set(0.5, 0.5);
        this.container.addChild(label);
      } else if (label.text !== cavity.label) label.text = cavity.label;
      label.visible = true;
      labels.push(label);
    }

    this.labels = labels;
  }

  private drawTooLargeNotice() {
    if (this.notice == null) {
      this.notice = this.drawPixi.getNewText(TOO_LARGE_NOTICE, LABEL_STYLE);
      this.notice.anchor.set(0.5, 0.5);
      this.container.addChild(this.notice);
    }
    this.notice.visible = true;
    this.notice.x = this.drawPixi.pixiApp.renderer.width / 2;
    this.notice.y = this.drawPixi.pixiApp.renderer.height / 2;
  }
}
