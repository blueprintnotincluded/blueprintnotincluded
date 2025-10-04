import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { MdbBuilding } from '../io/mdb/mdb-building';
import { Overlay } from '../enums/overlay';
import { SpriteTag } from '../enums/sprite-tag';
import { Display } from '../enums/display';
import { Visualization } from '../enums/visualization';
import { DrawHelpers } from '../drawing/draw-helpers';

export enum InfoIcon {
  icon_inf,
  icon_int,
  icon_exc,
  icon_no1,
  icon_no2,
  icon_no3,
  icon_no4,
  icon_no5,
  icon_no6,
  icon_no7,
  icon_no8,
  icon_no9,
}

export class BlueprintItemInfo extends BlueprintItem {
  static defaultInfoString: string = '';
  infoString: string = '';

  static defaultTitle: string = '';
  title: string = '';

  static defaultBackColor: number = 0x007ad9;
  backColor: number = 0x007ad9;

  static defaultFrontColor: number = 0xffffff;
  frontColor: number = 0xffffff;

  static defaultIcon: InfoIcon = InfoIcon.icon_inf;
  icon: InfoIcon = InfoIcon.icon_inf;

  get htmlFrontColor() {
    return DrawHelpers.colorToHex(this.frontColor);
  }
  get htmlBackColor() {
    return DrawHelpers.colorToHex(this.backColor);
  }
  get htmlSvgPath() {
    return BlueprintItemInfo.getIconSvgPath(this.icon);
  }

  constructor(id: string) {
    super(id);
  }

  public prepareSpriteVisibility(camera: CameraService) {}

  public updateTileables(blueprint: Blueprint) {}

  drawTemplateItem(templateItem: BlueprintItem, camera: CameraService) {}

  public importMdbBuilding(original: MdbBuilding) {
    if (original.infoString == null) this.infoString = BlueprintItemInfo.defaultInfoString;
    else this.infoString = original.infoString;

    if (original.title == null) this.title = BlueprintItemInfo.defaultTitle;
    else this.title = original.title;

    if (original.backColor == null) this.backColor = BlueprintItemInfo.defaultBackColor;
    else this.backColor = original.backColor;

    if (original.frontColor == null) this.frontColor = BlueprintItemInfo.defaultFrontColor;
    else this.frontColor = original.frontColor;

    if (original.icon == null) this.icon = BlueprintItemInfo.defaultIcon;
    else this.icon = original.icon;

    super.importMdbBuilding(original);
  }

  public toMdbBuilding(): MdbBuilding {
    let returnValue = super.toMdbBuilding();

    if (this.infoString != BlueprintItemInfo.defaultInfoString)
      returnValue.infoString = this.infoString;
    if (this.title != BlueprintItemInfo.defaultTitle) returnValue.title = this.title;
    if (this.backColor != BlueprintItemInfo.defaultBackColor)
      returnValue.backColor = this.backColor;
    if (this.frontColor != BlueprintItemInfo.defaultFrontColor)
      returnValue.frontColor = this.frontColor;
    if (this.icon != BlueprintItemInfo.defaultIcon) returnValue.icon = this.icon;

    return returnValue;
  }

  public cleanUp() {
    if (this.infoString == null) this.infoString = BlueprintItemInfo.defaultInfoString;
    if (this.title == null) this.title = BlueprintItemInfo.defaultTitle;
    if (this.backColor == null) this.backColor = BlueprintItemInfo.defaultBackColor;
    if (this.frontColor == null) this.frontColor = BlueprintItemInfo.defaultFrontColor;
    if (this.icon == null) this.icon = BlueprintItemInfo.defaultIcon;
    super.cleanUp();
  }

  cameraChanged(camera: CameraService) {
    //super.cameraChanged(camera);

    this.isOpaque = camera.overlay == Overlay.Gas || camera.overlay == Overlay.Base;

    this.depth = 300; //this.oniItem.zIndex;
    this.alpha = 1;

    for (let drawPart of this.drawParts) {
      if (drawPart.hasTag(SpriteTag.info_back)) {
        drawPart.visible = true;
        drawPart.zIndex = 0;
        drawPart.alpha = 1;
        this.visualizationTint = this.backColor;
        drawPart.tint = this.backColor;
      } else if (drawPart.hasTag(SpriteTag.info_front)) {
        drawPart.visible = true;
        drawPart.zIndex = 0;
        drawPart.alpha = 1;
        drawPart.tint = this.frontColor;
        if (drawPart.spriteModifier.spriteInfoName != 'info_front_' + this.icon)
          drawPart.visible = false;
      }
    }
  }

  modulateSelectedTint(camera: CameraService) {
    for (let drawPart of this.drawParts) {
      if (drawPart.hasTag(SpriteTag.info_back)) {
        if (this.visualizationTint != -1) {
          // If the drawPart is visible, we assume the code before already set the correct values, and we just modulate the tint
          drawPart.tint = DrawHelpers.blendColor(this.visualizationTint, 0x4cff00, camera.sinWave);
        } else {
          drawPart.visible = true;
          drawPart.zIndex = 1;
          drawPart.tint = 0x4cff00;
          drawPart.alpha = camera.sinWave * 0.8;
        }
      }

      this.applyTileablesToDrawPart(drawPart);
    }
  }

  static getIconSvgPath(icon: InfoIcon): string {
    switch (icon) {
      case InfoIcon.icon_inf:
        return 'm 35.8 99.94c0 3.48 1.68 5.52 5.28 5.52h45.96c3.36 0 5.16-2.04 5.16-5.52 0-3.36-1.68-5.4-5.16-5.4h-17.4v-40.8c0-3.36-1.68-5.4-5.16-5.4h-19.92c-3.6 0-5.16 2.16-5.16 5.4 0 3.48 1.56 5.52 5.16 5.52h13.32v35.28h-16.8c-3.6 0-5.28 2.04-5.28 5.4zm26.88-77.4c-3.84 0-7.2 0.84-7.2 5.28v7.68c0 4.68 3.48 5.28 7.2 5.28s6.96-0.84 6.96-5.28v-7.68c0-4.44-3.24-5.28-6.96-5.28 z';
      case InfoIcon.icon_int:
        return 'm 47.5,49.24 c 3.48,0 5.76,-1.68 5.76,-5.4 v -4.08 c 3,-1.08 6.6,-1.68 11.04,-1.68 6.24,0 9.84,2.76 9.84,8.04 0,3 -0.84,4.56 -2.52,6 -2.28,2.16 -5.4,3.6 -9.24,5.16 l -4.08,1.68 c -1.92,0.72 -2.64,2.4 -2.64,4.32 0,0.12 0,0.12 0,0.12 l 0.6,11.4 c 0.24,3 2.64,4.44 5.52,4.44 2.64,0 5.28,-1.44 5.52,-4.32 l 0.48,-7.44 C 76.54,64 86.5,59.32 86.5,46.12 86.5,43.24 86.02,40.6 84.94,38.2 81.82,30.76 74.5,26.44 64.3,26.44 56.02,26.44 49.18,28.6 43.66,31.96 42.1,32.8 41.5,34.6 41.5,36.4 v 7.44 c 0,3.96 2.4,5.4 6,5.4 z m 23.88,42.6 c 0,-5.28 -4.32,-9.48 -9.72,-9.48 -1.2,0 -2.52,0.24 -3.72,0.84 -3,1.32 -5.76,4.32 -5.76,8.64 0,5.4 4.08,9.72 9.48,9.72 5.52,0 9.72,-4.2 9.72,-9.72 z';
      case InfoIcon.icon_exc:
        return 'm 67.899999,26.44 h -7.68 c -2.64,0 -4.2,1.92 -3.96,4.44 l 2.76,38.04 c 0.24,2.64 2.4,4.08 4.92,4.08 2.76,0 4.8,-1.56 4.92,-4.2 l 2.88,-37.92 c 0.24,-2.52 -1.32,-4.44 -3.84,-4.44 z m -14.4,64.56 c 0,6.12 4.44,10.56 10.44,10.56 6,0 10.56,-4.56 10.56,-10.56 0,-4.8 -3.12,-10.56 -10.56,-10.56 -6.72,0 -10.44,5.52 -10.44,10.56 z';
      case InfoIcon.icon_no1:
        return 'm 83.726495,101.02 c 3.48,0 5.04,-2.160001 5.04,-5.400001 0,-3.48 -1.56,-5.52 -5.04,-5.52 h -13.56 v -57.72 c 0,-2.64 -1.56,-5.4 -4.68,-5.4 -0.48,0 -1.08,0.12 -1.68,0.36 l -21.48,7.68 c -2.88,0.96 -3.72,3.84 -2.64,6.96 0.72,2.28 2.52,5.04 6.24,3.72 l 12.48,-4.56 v 58.32 c 0,0.720001 0.6,1.560001 1.56,1.560001 z';
      case InfoIcon.icon_no2:
        return 'm 85.180001,100.9 c 3,0 3.6,-3.600004 3.6,-5.640004 0,-1.92 -0.6,-5.16 -3.6,-5.28 h -27 l 17.16,-17.52 c 1.92,-1.92 3.6,-3.72 5.16,-5.52 3.72,-4.44 7.44,-9.84 7.44,-17.88 0,-3.36 -0.6,-6.48 -1.8,-9.24 -3.36,-8.04 -11.4,-12.72 -22.32,-12.72 -8.4,0 -15.24,3.12 -20.4,6.72 -1.44,0.96 -2.04,2.64 -2.04,4.44 v 8.64 c 0,3.84 2.4,5.4 6,5.4 3.48,0 5.88,-1.56 5.88,-5.4 v -5.52 c 2.76,-1.44 6.36,-2.64 10.68,-2.64 7.44,0 11.76,3.6 11.76,10.32 0,1.32 -0.12,2.64 -0.48,3.72 -1.44,5.04 -5.16,8.28 -8.88,12.36 l -25.68,26.04 c -0.12,0 -0.12,0 -0.12,0 -0.96,1.08 -1.32,2.64 -1.32,4.2 0,3.48 1.68,5.520004 5.28,5.520004 z';
      case InfoIcon.icon_no3:
        return 'm 79.859289,61.6 c 4.2,-2.88 7.32,-7.44 7.32,-14.4 0,-3.12 -0.6,-6 -1.68,-8.52 -3.48,-7.8 -11.52,-12.24 -22.08,-12.24 -8.16,0 -14.28,2.16 -19.56,5.4 -1.56,0.84 -2.28,2.4 -2.28,4.44 v 6.48 c 0,3.96 2.52,5.28 6,5.28 3.36,0 5.76,-1.44 5.76,-5.28 v -2.88 c 2.76,-1.2 6.12,-1.8 10.2,-1.8 7.32,0 11.64,2.88 11.64,9.12 0,6.84 -4.2,9.6 -12,9.6 h -3.24 c -3.6,0 -5.28,2.04 -5.28,5.4 0,3.48 1.68,5.52 5.28,5.52 h 4.2 c 8.28,0 13.08,3.36 13.08,10.8 0,7.56 -4.92,11.28 -13.32,11.28 -6.6,0 -12.48,-2.76 -16.68,-5.76 -2.52,-2.16 -5.16,-0.84 -6.6,0.96 -0.36,0.24 -0.6,0.72 -0.84,1.08 -1.8,2.88 -1.8,5.76 1.08,7.8 5.64,4.08 13.32,7.68 22.92,7.68 4.08,0 7.68,-0.6 10.8,-1.68 8.52,-3.12 14.88,-9.96 14.88,-21.36 0,-8.16 -3.96,-13.68 -9.6,-16.92 z';
      case InfoIcon.icon_no4:
        return 'm 85.48,100.9 c 3.48,0 5.04,-2.160004 5.04,-5.520004 0,-3.36 -1.56,-5.4 -5.04,-5.4 h -6.36 v -10.2 h 8.04 c 3.48,0 5.16,-2.04 5.16,-5.52 0,-3.36 -1.68,-5.4 -5.16,-5.4 h -8.04 v -35.76 c 0,-3.96 -2.64,-6 -6.48,-6 -3.96,0 -6.12,1.68 -7.8,4.08 l -28.32,39.48 c -0.72,1.08 -0.84,2.28 -0.84,3.72 0,3.36 1.68,5.4 5.28,5.4 h 26.4 v 19.68 C 67.36,100.18 68.08,100.9 68.92,100.9 Z m -17.76,-54.720004 -0.36,22.68 h -15.6 z';
      case InfoIcon.icon_no5:
        return 'm 54.277644,52.960002 0.6,-14.88 h 25.92 c 3.48,0 5.16,-2.04 5.16,-5.52 0,-3.36 -1.56,-5.52 -5.16,-5.52 h -31.32 c -3.72,0 -5.64,1.8 -5.88,5.28 l -1.2,29.28 c -0.24,3.96 2.52,5.4 6,5.4 1.32,0 2.52,-0.12 3.6,-0.84 3.6,-2.4 6.96,-3.96 12.6,-3.96 2.04,0 3.84,0.36 5.4,0.96 4.32,1.92 7.32,6 7.32,12.48 0,8.64 -5.16,13.56 -13.92,13.56 -6.48,0 -12.12,-2.52 -16.2,-5.52 -3.36,-2.4 -6.12,-0.24 -7.56,2.16 -1.92,3 -1.56,6 1.32,7.92 5.52,3.72 13.44,7.199998 22.44,7.199998 3.84,0 7.44,-0.6 10.8,-1.919998 8.76,-3.6 15.36,-11.4 15.36,-23.52 0,-3.48 -0.6,-6.84 -1.68,-9.96 -3.12,-8.76 -10.92,-15 -22.56,-15 -4.32,0 -7.8,0.96 -11.04,2.4 z';
      case InfoIcon.icon_no6:
        return 'm 77.74,78.04 c 0,1.92 -0.36,3.48 -0.96,4.92 -1.8,4.2 -5.76,6.84 -12.24,6.84 -8.4,0 -13.44,-4.56 -13.44,-12.6 0,-1.68 0.36,-3.12 0.96,-4.56 1.8,-3.96 6.12,-6.6 12.48,-6.6 8.16,0 13.2,4.2 13.2,12 z M 51.22,59.44 c 3.6,-13.56 14.76,-20.76 31.44,-21.48 3.84,-0.12 3.96,-3.84 3.72,-6.36 -0.24,-2.76 -1.56,-5.16 -4.8,-5.16 -0.12,0 -0.12,0 -0.12,0 -10.2,0.48 -18.72,2.88 -25.32,7.2 -10.44,6.84 -18.12,18.24 -18.12,35.16 0,11.28 2.76,20.04 8.88,25.92 4.08,3.84 9.72,6.84 17.64,6.84 3.72,0 7.2,-0.6 10.32,-1.8 8.4,-3.12 15.12,-10.2 15.12,-21.6 0,-3.6 -0.6,-6.84 -1.92,-9.72 C 84.58,60.28 77.02,54.4 65.74,54.4 c -6,0 -10.8,1.92 -14.52,5.04 z';
      case InfoIcon.icon_no7:
        return 'm 39.099999,36.508985 c 0,0.72 0.6,1.56 1.56,1.56 h 34.32 l -23.04,56.16 c -1.32,3 0.36,5.16 2.28,5.999995 0.72,0.24 1.32,0.48 1.92,0.6 3.36,0.6 6.48,-0.72 7.44,-3.599995 l 24.96,-61.8 c 0.12,-0.12 0.12,-0.36 0.12,-0.6 0,-0.24 0.24,-1.2 0.24,-2.28 0,-3.24 -1.44,-5.52 -5.04,-5.52 h -39.48 c -4.44,0 -5.28,4.2 -5.28,9.48 z';
      case InfoIcon.icon_no8:
        return 'm 48.939999,61.72 c -5.4,3.12 -10.32,8.52 -10.32,17.04 0,3.24 0.6,6.36 1.92,9.12 3.72,8.04 12.12,13.68 23.52,13.68 3.48,0 6.84,-0.6 9.96,-1.68 8.16,-3 15.36,-9.96 15.36,-21.12 0,-8.4 -4.8,-13.68 -10.44,-17.04 4.32,-2.88 8.16,-7.56 8.16,-14.52 0,-2.88 -0.6,-5.64 -1.8,-8.16 -3.36,-7.44 -10.92,-12.6 -21.24,-12.6 -3.36,0 -6.36,0.48 -9.24,1.56 -7.32,2.88 -13.92,9.12 -13.92,19.2 0,6.96 3.6,11.52 8.04,14.52 z m 2.04,16.92 c 0,-6.96 5.4,-10.92 13.08,-10.92 1.92,0 3.72,0.24 5.28,0.84 4.32,1.56 7.68,4.68 7.68,10.08 0,1.68 -0.36,3.12 -0.96,4.56 -1.8,3.96 -5.76,6.6 -12,6.6 -7.8,0 -13.08,-3.96 -13.08,-11.16 z m 13.08,-40.56 c 6.48,0 11.04,3.36 11.04,9.24 0,1.32 -0.24,2.52 -0.84,3.72 -1.56,3.24 -5.16,5.64 -10.2,5.64 -1.8,0 -3.24,-0.24 -4.56,-0.72 -3.6,-1.32 -6.6,-4.08 -6.6,-8.64 0,-5.88 4.56,-9.24 11.16,-9.24 z';
      case InfoIcon.icon_no9:
        return 'm 50.320001,49.84 c 0,-7.68 5.16,-11.76 13.32,-11.76 2.04,0 3.84,0.36 5.52,0.96 4.56,1.8 7.8,5.52 7.8,11.64 0,1.68 -0.36,3.12 -0.96,4.56 -2.04,3.96 -6,6.6 -12.36,6.6 -8.28,0 -13.32,-4.08 -13.32,-12 z m 26.52,18.6 c -3.72,13.56 -14.52,20.76 -31.44,21.48 -3.84,0.12 -3.96,3.84 -3.72,6.36 0.24,2.76 1.56,5.28 4.92,5.28 0,0 0,0 0,0 5.28,-0.24 9.96,-0.96 14.16,-2.28 16.92,-5.28 29.16,-18.24 29.16,-40.2 0,-8.52 -1.32,-15 -4.68,-20.52 -3.96,-6.84 -10.92,-12.12 -21.6,-12.12 -3.84,0 -7.32,0.6 -10.44,1.68 -8.4,3.12 -15.12,10.44 -15.12,21.72 0,3.6 0.6,6.84 1.92,9.72 3.36,8.16 11.04,13.92 22.32,13.92 5.88,0 10.68,-1.92 14.52,-5.04 z';
      default:
        return '';
    }
  }
}
