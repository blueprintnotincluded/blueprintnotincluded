import {
  CameraService,
  Overlay,
  IObsCameraChanged,
} from "../../../../../lib/index";
import {} from "pixi.js-legacy";

export class DrawMiniUi implements IObsCameraChanged {
  overlays: Overlay[] = [
    Overlay.Base,
    Overlay.Power,
    Overlay.Liquid,
    Overlay.Gas,
    Overlay.Automation,
    Overlay.Conveyor,
  ];
  icons: string[] = [
    "icon_category_base",
    "icon_category_electrical",
    "icon_category_plumbing",
    "icon_category_ventilation",
    "icon_category_automation",
    "icon_category_shipping",
  ];
  texturesActive!: PIXI.Texture[];
  texturesInactive!: PIXI.Texture[];
  buttons!: PIXI.Sprite[];

  cameraChanged(camera: CameraService): void {
    for (let i = 0; i < this.overlays.length; i++) {
      if (camera.overlay == this.overlays[i])
        this.buttons[i].texture = this.texturesActive[i];
      else this.buttons[i].texture = this.texturesInactive[i];
    }
  }

  init(stage: PIXI.Container) {
    this.texturesActive = [];
    this.texturesInactive = [];
    this.buttons = [];

    let buttonPositionX = 50;
    for (let i = 0; i < this.overlays.length; i++) {
      this.texturesActive[i] = PIXI.Texture.from(
        "assets/images/miniui/" + this.icons[i] + ".png"
      );
      this.texturesInactive[i] = PIXI.Texture.from(
        "assets/images/miniui/" + this.icons[i] + "_disabled.png"
      );
      this.buttons[i] = new PIXI.Sprite(this.texturesActive[i]);
      this.buttons[i].buttonMode = true;
      this.buttons[i].anchor.set(0.5);
      this.buttons[i].width = 50;
      this.buttons[i].height = 50;
      this.buttons[i].position.x = buttonPositionX;
      this.buttons[i].position.y = 50;

      buttonPositionX += 60;

      this.buttons[i].interactive = true;

      switch (this.overlays[i]) {
        case Overlay.Base: {
          this.buttons[i].on("click", this.clickBase);
          break;
        }
        case Overlay.Power: {
          this.buttons[i].on("click", this.clickPower);
          break;
        }
        case Overlay.Liquid: {
          this.buttons[i].on("click", this.clickLiquid);
          break;
        }
        case Overlay.Gas: {
          this.buttons[i].on("click", this.clickGas);
          break;
        }
        case Overlay.Automation: {
          this.buttons[i].on("click", this.clickAutomation);
          break;
        }
        case Overlay.Conveyor: {
          this.buttons[i].on("click", this.clickConveyor);
          break;
        }
      }

      stage.addChild(this.buttons[i]);
    }
  }

  clickBase() {
    CameraService.cameraService.overlay = Overlay.Base;
  }
  clickPower() {
    CameraService.cameraService.overlay = Overlay.Power;
  }
  clickLiquid() {
    CameraService.cameraService.overlay = Overlay.Liquid;
  }
  clickGas() {
    CameraService.cameraService.overlay = Overlay.Gas;
  }
  clickAutomation() {
    CameraService.cameraService.overlay = Overlay.Automation;
  }
  clickConveyor() {
    CameraService.cameraService.overlay = Overlay.Conveyor;
  }
}
