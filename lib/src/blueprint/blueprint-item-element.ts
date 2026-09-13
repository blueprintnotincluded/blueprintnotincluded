import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { MdbBuilding } from '../io/mdb/mdb-building';
import { Overlay } from '../enums/overlay';
import { SpriteTag } from '../enums/sprite-tag';
import { Display } from '../enums/display';
import { Visualization } from '../enums/visualization';
import { DrawHelpers } from '../drawing/draw-helpers';
import { ZIndex } from '../enums/z-index';
import {
  elementItemOverlay,
  elementOwnOverlay,
  NEUTRONIUM_DISPLAY_COLOR,
  NEUTRONIUM_ELEMENT_ID,
  OVERLAY_DIMMED_ALPHA,
} from '../b-export/b-element';

export class BlueprintItemElement extends BlueprintItem {
  static defaultMass = 0;
  mass: number = 0;

  get header() {
    return this.buildableElements[0].name;
  }

  constructor(id: string) {
    super(id);
  }

  public prepareSpriteVisibility(_camera: CameraService) {}

  public updateTileables(_blueprint: Blueprint) {}

  drawTemplateItem(_templateItem: BlueprintItem, _camera: CameraService) {}

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

    const element = this.buildableElements[0];

    // Base (and Room, which maps to it) is every state's primary overlay;
    // gas/vacuum are additionally primary in Gas, liquid in Liquid. Solid has
    // no secondary overlay — it annotates natural terrain, which has no
    // gas/liquid concept of its own.
    const itemOverlay = elementItemOverlay(camera.overlay);
    const isPrimary = itemOverlay == Overlay.Base;
    const ownOverlay = elementOwnOverlay(element);
    const isSecondary = ownOverlay != null && itemOverlay == ownOverlay;

    this.isOpaque = isPrimary || isSecondary;
    this.alpha = this.isOpaque ? 1 : OVERLAY_DIMMED_ALPHA;

    // Solid cells are terrain: they sit behind everything, so a building
    // placed on top of annotated ground is never covered by it. Gas and
    // liquid cells layer like a conduit — above buildings in Base, above
    // dimmed buildings in their own overlay, at their raw tier elsewhere.
    if (element.hasTag('Solid')) this.depth = ZIndex.Backwall;
    else if (isPrimary) this.depth = this.oniItem.zIndex + 100;
    else if (isSecondary) this.depth = this.oniItem.zIndex + 50;
    else this.depth = this.oniItem.zIndex;

    // Blueprint (ghost) display has no cell art of its own; None renders like
    // solid display, matching how buildings treat it
    // (DrawPart.prepareVisibilityBasedOnDisplay).
    const displayVisible = camera.display != Display.blueprint;

    for (let drawPart of this.drawParts) {
      drawPart.visible = false;

      // TODO boolean in export
      // TODO Refactor most of this
      if (element.hasTag('Gas') && displayVisible) {
        if (drawPart.hasTag(SpriteTag.element_back)) {
          drawPart.visible = true;
          drawPart.zIndex = 0;
          drawPart.alpha = 0.5;

          // We use visualization tint here because this could be modulated by the selection
          if (camera.visualization == Visualization.temperature)
            this.visualizationTint = DrawHelpers.temperatureToColor(this.temperature);
          else this.visualizationTint = element.uiColor;

          drawPart.tint = this.visualizationTint;
        } else if (drawPart.hasTag(SpriteTag.element_gas_front)) {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.alpha = 0.8;
          drawPart.tint = 0xffffff;
        }
      } else if (element.hasTag('Liquid') && displayVisible) {
        if (drawPart.hasTag(SpriteTag.element_back)) {
          drawPart.visible = true;
          drawPart.zIndex = 0;
          drawPart.alpha = 0.5;

          if (camera.visualization == Visualization.temperature)
            this.visualizationTint = DrawHelpers.temperatureToColor(this.temperature);
          else this.visualizationTint = element.uiColor;

          drawPart.tint = this.visualizationTint;
        } else if (drawPart.hasTag(SpriteTag.element_liquid_front)) {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.alpha = 0.8;
          drawPart.tint = 0xffffff;
        }
      } else if (element.hasTag('Solid') && displayVisible) {
        // There is no solid front sprite, so the tinted back *is* the cell;
        // it renders near-opaque because a solid reads as material rather
        // than as something you see through.
        if (drawPart.hasTag(SpriteTag.element_back)) {
          drawPart.visible = true;
          drawPart.zIndex = 0;
          drawPart.alpha = 0.95;

          if (camera.visualization == Visualization.temperature)
            this.visualizationTint = DrawHelpers.temperatureToColor(this.temperature);
          // `color` rather than `uiColor` here: a solid cell shows the material
          // itself, and `color` is its in-world colour, whereas gas and liquid
          // use uiColor because their in-world colour is nearly transparent.
          // Neutronium is the one element whose exported colours are both
          // sentinels, so it gets a display tint (see NEUTRONIUM_DISPLAY_COLOR).
          else if (element.id === NEUTRONIUM_ELEMENT_ID)
            this.visualizationTint = NEUTRONIUM_DISPLAY_COLOR;
          else this.visualizationTint = element.color;

          drawPart.tint = this.visualizationTint;
        }
      } else if (element.hasTag('Vacuum') && displayVisible) {
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
