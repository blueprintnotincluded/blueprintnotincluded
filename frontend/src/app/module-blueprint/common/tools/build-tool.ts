import { BlueprintService } from "../../services/blueprint-service";
import {
  BlueprintHelpers,
  BlueprintItemWire,
  BlueprintItem,
  CameraService,
  DrawHelpers,
  Vector2,
  BuildLocationRule,
  ConnectionHelper,
} from "../../../../../../lib/index";
import { Injectable, ApplicationRef } from "@angular/core";
import { ITool, IChangeTool, ToolType } from "./tool";
import { DrawPixi } from "../../drawing/draw-pixi";

// Bridges overlap other buildings freely; only their utility ports can conflict.
const BRIDGE_LOCATION_RULES: ReadonlySet<BuildLocationRule> = new Set([
  BuildLocationRule.Conduit,
  BuildLocationRule.WireBridge,
  BuildLocationRule.LogicBridge,
  // U59: the conductive pipe bridge is a liquid bridge with an origin-cell rule
  BuildLocationRule.NoLiquidConduitAtOrigin,
]);

@Injectable()
export class BuildTool implements ITool {
  templateItemToBuild!: BlueprintItem;
  private observers: IObsBuildItemChanged[];

  parent!: IChangeTool;

  constructor(
    private blueprintService: BlueprintService,
    private appRef: ApplicationRef,
  ) {
    this.observers = [];
  }

  subscribeBuildItemChanged(observer: IObsBuildItemChanged) {
    this.observers.push(observer);
  }

  destroy() {
    if (this.templateItemToBuild != null) {
      this.templateItemToBuild.destroy();
      this.templateItemToBuild = null!;
    }
  }

  private updateBuildCandidateResult() {
    const previousCanBuild =
      this.templateItemToBuild.buildCandidateResult.canBuild.valueOf();
    const previousCantBuildReason =
      this.templateItemToBuild.buildCandidateResult.cantBuildReason.valueOf();

    this.templateItemToBuild.buildCandidateResult.canBuild = true;
    this.templateItemToBuild.buildCandidateResult.cantBuildReason = "";

    // First : iterate all the buildings on each tile of this building

    const isBridge = BRIDGE_LOCATION_RULES.has(
      this.templateItemToBuild.oniItem.buildLocationRule,
    );

    for (const tileIndex of this.templateItemToBuild.tileIndexes) {
      for (const templateItem of this.blueprintService.blueprint.getBlueprintItemsAtIndex(
        tileIndex,
      )) {
        // If at least one of them is in the same object layer, we can't build
        // We skip this step for bridges, who only care about their utility ports
        if (
          !isBridge &&
          this.templateItemToBuild.oniItem.objectLayer ==
            templateItem.oniItem.objectLayer
        ) {
          this.templateItemToBuild.buildCandidateResult.canBuild = false;
          this.templateItemToBuild.buildCandidateResult.cantBuildReason = $localize`Can\'t build here : ${templateItem.oniItem.name} is in the way`;
        }
      }
    }

    const utilityConnections =
      this.templateItemToBuild.oniItem.utilityConnections;
    for (
      let connectionIndex = 0;
      connectionIndex < utilityConnections.length;
      connectionIndex++
    ) {
      const connectionToBuild = utilityConnections[connectionIndex];
      // Rotation/scale are baked into this cache whenever the candidate's orientation changes;
      // only the (cheap) position offset needs to happen per hover.
      const cachedOffset =
        this.templateItemToBuild.utilityConnectionOffsets[connectionIndex];
      const connectionToBuildPosition = new Vector2(
        cachedOffset.x + this.templateItemToBuild.position.x,
        cachedOffset.y + this.templateItemToBuild.position.y,
      );

      const utilitiesAtIndex =
        this.blueprintService.blueprint.getUtilityConnectionsAtIndex(
          DrawHelpers.getTileIndex(connectionToBuildPosition),
        );
      for (const trackedUtilities of utilitiesAtIndex) {
        if (
          ConnectionHelper.getConnectionOverlay(connectionToBuild.type) ==
          ConnectionHelper.getConnectionOverlay(
            trackedUtilities.utilityConnection.type,
          )
        ) {
          this.templateItemToBuild.buildCandidateResult.canBuild = false;
          const connection = ConnectionHelper.getConnectionName(
            trackedUtilities.utilityConnection.type,
          );
          const itemName = trackedUtilities.blueprintItem.oniItem.name;
          this.templateItemToBuild.buildCandidateResult.cantBuildReason = $localize`Can\'t build here : The ${connection} from ${itemName} is in the way`;
        }
      }
    }

    if (
      previousCanBuild !=
        this.templateItemToBuild.buildCandidateResult.canBuild ||
      previousCantBuildReason !=
        this.templateItemToBuild.buildCandidateResult.cantBuildReason
    ) {
      // The mousemouse is outside the angular zone, so we have to force a full update here.
      this.appRef.tick();
    }
  }

  build() {
    if (!this.templateItemToBuild.buildCandidateResult.canBuild) return;

    const newItem = BlueprintHelpers.cloneBlueprintItem(
      this.templateItemToBuild,
      false,
      true,
    );

    newItem.prepareBoundingBox();
    newItem.updateTileables(this.blueprintService.blueprint);
    this.blueprintService.blueprint.addBlueprintItem(newItem);
    this.blueprintService.blueprint.refreshOverlayInfo();
    this.updateBuildCandidateResult();
  }

  private connectAToB(a: BlueprintItemWire, b: BlueprintItemWire) {
    let bitMask = 0;
    if (a.position.x == b.position.x + 1 && a.position.y == b.position.y)
      bitMask = 1;
    else if (a.position.x == b.position.x - 1 && a.position.y == b.position.y)
      bitMask = 2;
    else if (a.position.x == b.position.x && a.position.y == b.position.y - 1)
      bitMask = 4;
    else if (a.position.x == b.position.x && a.position.y == b.position.y + 1)
      bitMask = 8;

    a.connections = a.connections | bitMask;
  }

  changeItem(item: BlueprintItem) {
    if (this.templateItemToBuild != null) this.templateItemToBuild.destroy();

    CameraService.cameraService.setOverlayForItem(item.oniItem);

    this.templateItemToBuild = item;
    this.templateItemToBuild.setInvisible();
    this.templateItemToBuild.alpha = 1;
    this.templateItemToBuild.cleanUp();

    this.templateItemToBuild.isBuildCandidate = true;
    this.templateItemToBuild.prepareBoundingBox();
    this.templateItemToBuild.updateTileables(this.blueprintService.blueprint);
    this.observers.map((observer) => observer.itemChanged(item));
  }

  buildAndConnect(tileStart: Vector2, tileStop: Vector2) {
    this.templateItemToBuild.position = Vector2.clone(tileStop)!;
    this.templateItemToBuild.prepareBoundingBox();
    this.updateBuildCandidateResult();
    this.build();

    if (this.templateItemToBuild.oniItem.isWire) {
      const itemsPrevious = this.blueprintService.blueprint
        .getBlueprintItemsAt(tileStart)
        .filter(
          (i) =>
            i.oniItem.objectLayer ==
            this.templateItemToBuild.oniItem.objectLayer,
        );
      const itemsCurrent = this.blueprintService.blueprint
        .getBlueprintItemsAt(tileStop)
        .filter(
          (i) =>
            i.oniItem.objectLayer ==
            this.templateItemToBuild.oniItem.objectLayer,
        );

      if (
        itemsPrevious != null &&
        itemsPrevious.length > 0 &&
        itemsCurrent != null &&
        itemsCurrent.length > 0
      ) {
        const itemPrevious = itemsPrevious[0] as BlueprintItemWire;
        const itemCurrent = itemsCurrent[0] as BlueprintItemWire;

        this.connectAToB(itemPrevious, itemCurrent);
        this.connectAToB(itemCurrent, itemPrevious);
        itemPrevious.updateTileables(this.blueprintService.blueprint);
        itemCurrent.updateTileables(this.blueprintService.blueprint);

        this.blueprintService.blueprint.emitBlueprintChanged();
      }
    }
  }

  // Tool interface :
  switchFrom() {
    this.templateItemToBuild.destroy();
  }

  switchTo() {
    // required by type
  }

  mouseOut() {
    if (this.templateItemToBuild != null)
      this.templateItemToBuild.setInvisible();
  }

  leftClick(tile: Vector2) {
    this.templateItemToBuild.position = tile;
    this.build();
  }

  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }

  hover(tile: Vector2) {
    this.templateItemToBuild.position = Vector2.clone(tile)!;
    this.templateItemToBuild.prepareBoundingBox();
    this.templateItemToBuild.sortChildren();
    this.updateBuildCandidateResult();
  }

  drag(tileStart: Vector2, tileStop: Vector2) {
    if (tileStart == null || tileStop == null) return;

    const tileStartInt = DrawHelpers.getIntegerTile(tileStart);
    const tileStopInt = DrawHelpers.getIntegerTile(tileStop);

    // Only drag if we are changing tiles
    if (!tileStartInt.equals(tileStopInt))
      this.dragStepByStep(tileStart, tileStop);
  }

  mouseDown(tile: Vector2) {
    this.templateItemToBuild.position = tile;
    this.build();
  }

  dragStepByStep(tileStart: Vector2, tileStop: Vector2) {
    //console.log('start')
    //console.log(tileStart);
    //console.log(tileStop);

    // This is the unit taxicab vector representing the general direction of movement
    let delta = new Vector2(
      DrawHelpers.getFloorTile(tileStop).x -
        DrawHelpers.getFloorTile(tileStart).x,
      DrawHelpers.getFloorTile(tileStop).y -
        DrawHelpers.getFloorTile(tileStart).y,
    );

    delta = new Vector2(
      delta.x == 0 ? 0 : 1 * (delta.x / Math.abs(delta.x)),
      delta.y == 0 ? 0 : 1 * (delta.y / Math.abs(delta.y)),
    );

    // Special cases : if tileStart or tileStop is an integer, we run into problems, so let's change that
    if (tileStart.x == Math.floor(tileStart.x)) tileStart.x -= delta.x * 0.005;
    if (tileStop.x == Math.floor(tileStop.x)) tileStop.x += delta.x * 0.005;
    if (tileStart.y == Math.floor(tileStart.y)) tileStart.y -= delta.y * 0.005;
    if (tileStop.y == Math.floor(tileStop.y)) tileStop.y += delta.y * 0.005;

    // Current tile is the float tile that will
    const currentTile: Vector2 = Vector2.clone(tileStart)!;

    //console.log('delta');
    //console.log(delta);

    // We will either stop advancing when we reach the goal, or when too many loops are through
    let advance = true;
    let i = 0;

    // The algorithm requires floor for both x and y
    // However for blueprint, it's floor(x) and ceil(y)
    const startTile = DrawHelpers.getIntegerTile(tileStart);
    //console.log(startTile);

    while (advance) {
      //console.log(DrawHelpers.getIntegerTile(currentTile));

      //console.log('currentTile before');
      //console.log(currentTile);

      // nextTile is currentTile advanced by delta
      // and then floored of ceilingedto be closest to currentTile
      const nextTile = new Vector2(
        currentTile.x + delta.x,
        currentTile.y + delta.y,
      );
      if (delta.x > 0) nextTile.x = Math.floor(nextTile.x);
      else if (delta.x < 0) nextTile.x = Math.ceil(nextTile.x);
      if (delta.y > 0) nextTile.y = Math.floor(nextTile.y);
      else if (delta.y < 0) nextTile.y = Math.ceil(nextTile.y);

      //console.log('nextTile');
      //console.log(nextTile);

      // d is the distance vector between the final target and currentTile
      const d = new Vector2(
        tileStop.x - currentTile.x,
        tileStop.y - currentTile.y,
      );

      // dp is the distance between the next Target and current Tile
      const dp = new Vector2(
        nextTile.x - currentTile.x,
        nextTile.y - currentTile.y,
      );

      const dLengthSquared = d.lengthSquared;

      //console.log('d')
      //console.log(d);
      //console.log('dp')
      //console.log(dp)

      let distX: number = 999;
      if (delta.x != 0)
        distX = new Vector2(dp.x, d.y * (dp.x / d.x)).lengthSquared;

      let distY: number = 999;
      if (delta.y != 0)
        distY = new Vector2(d.x * (dp.y / d.y), dp.y).lengthSquared;

      //console.log('dist')
      //console.log(new Vector2(distX, distY))

      let newTile: Vector2;
      if (Math.abs(distX - distY) < 0.0000005 && distX < dLengthSquared) {
        //console.log('build');
        //console.log('equal')

        newTile = new Vector2(startTile.x + delta.x, startTile.y);
        this.buildAndConnect(startTile, newTile);
        startTile.x += delta.x;
        //console.log(startTile);

        newTile = new Vector2(startTile.x, startTile.y + delta.y);
        this.buildAndConnect(startTile, newTile);
        startTile.y += delta.y;
        //console.log(startTile);

        currentTile.x += dp.x;
        currentTile.y += d.y * (dp.x / d.x);
      } else if (distX <= distY && distX < dLengthSquared) {
        //console.log('build');
        currentTile.x += dp.x;
        currentTile.y += d.y * (dp.x / d.x);

        newTile = new Vector2(startTile.x + delta.x, startTile.y);
        this.buildAndConnect(startTile, newTile);
        startTile.x += delta.x;
        //console.log(startTile);
      } else if (distY < distX && distY < dLengthSquared) {
        //console.log('build');
        currentTile.x += d.x * (dp.y / d.y);
        currentTile.y += dp.y;

        newTile = new Vector2(startTile.x, startTile.y + delta.y);
        this.buildAndConnect(startTile, newTile);
        startTile.y += delta.y;
        //console.log(startTile);
      } else {
        //console.log('stop')
        advance = false;
      }

      i++;
      if (i > 999) throw new Error("The tile dragger was too long");
    }
  }

  dragStop() {
    // required for type
  }

  keyDown(keyCode: string) {
    if (keyCode == "o") {
      if (this.templateItemToBuild != null) {
        this.templateItemToBuild.nextOrientation();
        this.updateBuildCandidateResult();
      }
    }
  }

  draw(drawPixi: DrawPixi, camera: CameraService) {
    // TODO SOLID
    //if (this.canBuild()) this.templateItemToBuild.drawPart.tint = DrawHelpers.whiteColor;
    //else this.templateItemToBuild.drawPart.tint = 0xD40000;

    this.templateItemToBuild.drawPixi(camera, drawPixi);
    // TODO correct red and alpha when building outside of overlay
  }

  toggleable: boolean = false;
  visible: boolean = false;
  captureInput: boolean = true;
  toolType = ToolType.build;
  toolGroup: number = 1;
}

export interface IObsBuildItemChanged {
  itemChanged(templateItem: BlueprintItem): void;
}
