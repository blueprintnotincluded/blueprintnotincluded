import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { MdbBuilding } from '../io/mdb/mdb-building';
import { Overlay } from '../enums/overlay';
import { SpriteTag } from '../enums/sprite-tag';
import { Display } from '../enums/display';
import { Visualization } from '../enums/visualization';
import { DrawHelpers } from '../drawing/draw-helpers';

export class BlueprintItemElement extends BlueprintItem {
  static defaultMass = 0;
  mass: number = 0;

  get header() {
    return this.buildableElements[0].name;
  }

  constructor(id: string) {
    super(id);
  }

  public prepareSpriteVisibility(camera: CameraService) {}

  public updateTileables(blueprint: Blueprint) {}

  drawTemplateItem(templateItem: BlueprintItem, camera: CameraService) {}

  public importMdbBuilding(original: MdbBuilding) {
    if (original.mass == undefined) this.mass = 0;
    else this.mass = original.mass;
    super.importMdbBuilding(original);
  }

  public toMdbBuilding(): MdbBuilding {
    let returnValue = super.toMdbBuilding();

    if (this.mass != BlueprintItemElement.defaultMass) returnValue.mass = this.mass;

    return returnValue;
  }

  public cleanUp() {
    if (this.mass == null) this.mass = BlueprintItemElement.defaultMass;
    super.cleanUp();
  }

  cameraChanged(camera: CameraService) {
    //super.cameraChanged(camera);

    this.isOpaque = camera.overlay == Overlay.Gas || camera.overlay == Overlay.Base;

    // TODO use enum
    if (camera.overlay == Overlay.Gas) this.depth = 17 + 50;
    else this.depth = 17;

    this.alpha = 1;

    for (let drawPart of this.drawParts) {
      drawPart.visible = false;

      // TODO boolean in export
      // TODO Refactor most of this
      if (
        this.buildableElements[0].hasTag('Gas') &&
        camera.display == Display.solid &&
        (camera.overlay == Overlay.Base || camera.overlay == Overlay.Gas)
      ) {
        if (drawPart.hasTag(SpriteTag.element_back)) {
          drawPart.visible = true;
          drawPart.zIndex = 0;
          drawPart.alpha = 0.5;

          // We use visualization tint here because this could be modulated by the selection
          if (camera.visualization == Visualization.temperature)
            this.visualizationTint = DrawHelpers.temperatureToColor(this.temperature);
          else this.visualizationTint = this.buildableElements[0].uiColor;

          drawPart.tint = this.visualizationTint;
        } else if (drawPart.hasTag(SpriteTag.element_gas_front)) {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.alpha = 0.8;
          drawPart.tint = 0xffffff;
        }
      } else if (
        this.buildableElements[0].hasTag('Liquid') &&
        camera.display == Display.solid &&
        (camera.overlay == Overlay.Base || camera.overlay == Overlay.Liquid)
      ) {
        if (drawPart.hasTag(SpriteTag.element_back)) {
          drawPart.visible = true;
          drawPart.zIndex = 0;
          drawPart.alpha = 0.5;

          if (camera.visualization == Visualization.temperature)
            this.visualizationTint = DrawHelpers.temperatureToColor(this.temperature);
          else this.visualizationTint = this.buildableElements[0].uiColor;

          drawPart.tint = this.visualizationTint;
        } else if (drawPart.hasTag(SpriteTag.element_liquid_front)) {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.alpha = 0.8;
          drawPart.tint = 0xffffff;
        }
      } else if (
        this.buildableElements[0].hasTag('Vacuum') &&
        camera.display == Display.solid &&
        (camera.overlay == Overlay.Base || camera.overlay == Overlay.Gas)
      ) {
        if (drawPart.hasTag(SpriteTag.element_vacuum_front)) {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.alpha = 0.8;
          drawPart.tint = 0xffffff;
        }
      }
    }
  }

  modulateSelectedTint(camera: CameraService) {
    if (camera.display == Display.solid) {
      for (let drawPart of this.drawParts) {
        // TODO maybe the gas and liquid element should have different tintable backs? fine for now
        if (
          drawPart.hasTag(SpriteTag.element_back) &&
          drawPart.visible &&
          this.visualizationTint != -1
        ) {
          drawPart.tint = DrawHelpers.blendColor(this.visualizationTint, 0x4cff00, camera.sinWave);
        }
      }
    }
  }
}
