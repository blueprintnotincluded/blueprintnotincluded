import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { OniBuilding } from '../io/oni/oni-building';
import { BniBuilding } from '../io/bni/bni-building';
import { MdbBuilding } from '../io/mdb/mdb-building';
import { CameraService } from '../drawing/camera-service';
import { DrawHelpers } from '../drawing/draw-helpers';
import { PixiUtil } from '../drawing/pixi-util';
import { Vector2 } from '../vector2';
import { BuildableElement } from '../b-export/b-element';
import { ZIndex } from '../enums/z-index';

export class BlueprintItemWire extends BlueprintItem {
  static defaultConnections = 0;

  private connections_: number = 0;
  public get connections() {
    return this.connections_;
  }
  public set connections(value: number) {
    if (value != this.connections_) this.reloadCamera = true;
    this.connections_ = value;
  }

  pipeElement: BuildableElement;

  constructor(id: string) {
    super(id);
    this.pipeElement = BuildableElement.getElement('None');
  }

  public importOniBuilding(building: OniBuilding) {
    this.connections = building.connections;
    super.importOniBuilding(building);
  }

  public importBniBuilding(building: BniBuilding) {
    this.connections = building.flags;
    super.importBniBuilding(building);
  }

  public importMdbBuilding(original: MdbBuilding) {
    if (original.connections == undefined) this.connections = 0;
    else this.connections = original.connections;

    if (original.pipeElement == undefined) this.pipeElement = BuildableElement.getElement('None');
    else this.pipeElement = BuildableElement.getElement(original.pipeElement);

    super.importMdbBuilding(original);
  }

  public cleanUp() {
    if (this.connections == null) this.connections = BlueprintItemWire.defaultConnections;
    super.cleanUp();

    this.updateDrawPartVisibilityBasedOnConnections();
  }

  cameraChanged(camera: CameraService) {
    super.cameraChanged(camera);
    this.updateDrawPartVisibilityBasedOnConnections();
  }

  modulateSelectedTint(camera: CameraService) {
    super.modulateSelectedTint(camera);
    this.updateDrawPartVisibilityBasedOnConnections();
  }

  modulateBuildCandidateTint(camera: CameraService) {
    super.modulateBuildCandidateTint(camera);
    this.updateDrawPartVisibilityBasedOnConnections();
  }

  private updateDrawPartVisibilityBasedOnConnections() {
    if (this.drawParts != null)
      for (let drawPart of this.drawParts)
        drawPart.makeEverythingButThisTagInvisible(DrawHelpers.connectionTag[this.connections]);
  }

  public drawPixi(camera: CameraService, pixiUtil: PixiUtil) {
    super.drawPixi(camera, pixiUtil);

    if (
      this.oniItem.isOverlayPrimary(camera.overlay) &&
      this.oniItem.zIndex == ZIndex.LiquidConduits &&
      this.pipeElement.id != 'None'
    ) {
      let truePosition = new Vector2(
        (this.position.x + 0.5 + camera.cameraOffset.x) /*- camera.linearReset*/ *
          camera.currentZoom,
        (-this.position.y + 0.5 + camera.cameraOffset.y) * camera.currentZoom
      );

      pixiUtil.getUtilityGraphicsFront().beginFill(this.oniItem.backColor, 1);
      pixiUtil
        .getUtilityGraphicsFront()
        .drawCircle(truePosition.x, truePosition.y, 0.32 * camera.currentZoom);
      pixiUtil.getUtilityGraphicsFront().endFill();

      pixiUtil.getUtilityGraphicsFront().beginFill(this.pipeElement.conduitColor, 1);
      pixiUtil
        .getUtilityGraphicsFront()
        .drawCircle(truePosition.x, truePosition.y, 0.26 * camera.currentZoom);
      pixiUtil.getUtilityGraphicsFront().endFill();
    }

    if (
      this.oniItem.isOverlayPrimary(camera.overlay) &&
      this.oniItem.zIndex == ZIndex.GasConduits &&
      this.pipeElement.id != 'None'
    ) {
      let truePosition = new Vector2(
        (this.position.x + 0.5 + camera.cameraOffset.x) /*- camera.linearReset*/ *
          camera.currentZoom,
        (-this.position.y + 0.5 + camera.cameraOffset.y) * camera.currentZoom
      );

      pixiUtil.getUtilityGraphicsFront().beginFill(this.oniItem.backColor, 1);
      pixiUtil
        .getUtilityGraphicsFront()
        .drawRect(
          truePosition.x - 0.32 * camera.currentZoom,
          truePosition.y - 0.32 * camera.currentZoom,
          0.64 * camera.currentZoom,
          0.64 * camera.currentZoom
        );
      pixiUtil.getUtilityGraphicsFront().endFill();

      pixiUtil.getUtilityGraphicsFront().beginFill(this.pipeElement.conduitColor, 1);
      pixiUtil
        .getUtilityGraphicsFront()
        .drawRect(
          truePosition.x - 0.26 * camera.currentZoom,
          truePosition.y - 0.26 * camera.currentZoom,
          0.52 * camera.currentZoom,
          0.52 * camera.currentZoom
        );
      pixiUtil.getUtilityGraphicsFront().endFill();
    }
  }

  public toMdbBuilding(): MdbBuilding {
    let returnValue = super.toMdbBuilding();

    if (this.connections != BlueprintItemWire.defaultConnections)
      returnValue.connections = this.connections;
    if (this.pipeElement.id != 'None') returnValue.pipeElement = this.pipeElement.id;

    return returnValue;
  }

  public toBniBuilding(): BniBuilding {
    let returnValue = super.toBniBuilding();

    returnValue.flags = this.connections;

    return returnValue;
  }

  public updateTileables(blueprint: Blueprint) {
    super.updateTileables(blueprint);
  }
}
