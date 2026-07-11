import { Injectable } from "@angular/core";
import { BlueprintService } from "../../services/blueprint-service";
import {
  BlueprintItemWire,
  CameraService,
  DrawHelpers,
  Vector2,
} from "../../../../../../lib/index";
import { ITool, ToolType } from "./tool";
import { DrawPixi } from "../../drawing/draw-pixi";
import { ToolService } from "../../services/tool-service";

// Index into DrawHelpers.connectionBits / connectionVectors: [Left, Right, Up, Down]
const LEFT = 0;
const RIGHT = 1;
const UP = 2;
const DOWN = 3;

// A tile occupies world x in [tileX, tileX + 1) and world y in (tileY - 1, tileY].
// Local coordinates below place the origin at the tile's top-left corner:
// localX 0..1 is left..right, localY 0..1 is top (Up neighbour)..bottom (Down neighbour).
// Each tile is split by both diagonals into 4 triangular "zones of control", one per
// connection direction. A zone is cut if the (possibly zero-area) selection rectangle
// touches it at all.
function zoneIntersectsRect(
  direction: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  switch (direction) {
    case LEFT:
      return x0 < 0.5 && y1 > x0 && y0 < 1 - x0;
    case RIGHT:
      return x1 > 0.5 && y0 < x1 && y1 > 1 - x1;
    case UP:
      return y0 < 0.5 && x1 > y0 && x0 < 1 - y0;
    case DOWN:
      return y1 > 0.5 && x1 > 1 - y1 && x0 < y1;
    default:
      return false;
  }
}

@Injectable()
export class ScissorsTool implements ITool {
  parent!: ToolService;

  constructor(private blueprintService: BlueprintService) {}

  private beginSelection: Vector2 | null = null;
  private endSelection: Vector2 | null = null;

  private disconnectBit(item: BlueprintItemWire, direction: number) {
    let connectionsArray = DrawHelpers.getConnectionArray(item.connections);
    if (!connectionsArray[direction]) return;

    connectionsArray[direction] = false;
    item.connections = DrawHelpers.getConnection(connectionsArray);
    item.updateTileables(this.blueprintService.blueprint);

    let offset = DrawHelpers.connectionVectors[direction];
    let neighborPosition = new Vector2(
      item.position.x + offset.x,
      item.position.y + offset.y
    );

    let neighborItems = this.blueprintService.blueprint
      .getBlueprintItemsAt(neighborPosition)
      .filter(
        (i) =>
          i.oniItem.isWire && i.oniItem.objectLayer == item.oniItem.objectLayer
      );

    for (let neighborItem of neighborItems) {
      let neighborWire = neighborItem as BlueprintItemWire;
      let neighborArray = DrawHelpers.getConnectionArray(
        neighborWire.connections
      );
      neighborArray[DrawHelpers.connectionBitsOpposite[direction]] = false;
      neighborWire.connections = DrawHelpers.getConnection(neighborArray);
      neighborWire.updateTileables(this.blueprintService.blueprint);
    }
  }

  private cutBox(begin: Vector2, end: Vector2) {
    // Only cut connections belonging to the overlay currently being viewed
    // (Power/Plumbing/Ventilation/etc), same as build-tool restricts placement.
    let currentOverlay = CameraService.cameraService?.overlay;

    let xMin = Math.min(begin.x, end.x);
    let xMax = Math.max(begin.x, end.x);
    let yMin = Math.min(begin.y, end.y);
    let yMax = Math.max(begin.y, end.y);

    // Tile range spanned by the continuous box, using the same integer tile
    // convention (floor x, ceil y) as the rest of the tool code.
    let topLeftTile = DrawHelpers.getIntegerTile(new Vector2(xMin, yMax));
    let bottomRightTile = DrawHelpers.getIntegerTile(new Vector2(xMax, yMin));

    this.blueprintService.blueprint.pauseChangeEvents();

    try {
      for (let tileX = topLeftTile.x; tileX <= bottomRightTile.x; tileX++) {
        for (let tileY = bottomRightTile.y; tileY <= topLeftTile.y; tileY++) {
          let localX0 = Math.min(Math.max(xMin - tileX, 0), 1);
          let localX1 = Math.min(Math.max(xMax - tileX, 0), 1);
          let localY0 = Math.min(Math.max(tileY - yMax, 0), 1);
          let localY1 = Math.min(Math.max(tileY - yMin, 0), 1);

          let wireItems = this.blueprintService.blueprint
            .getBlueprintItemsAt(new Vector2(tileX, tileY))
            .filter(
              (i) =>
                i.oniItem.isWire && i.oniItem.isOverlayPrimary(currentOverlay)
            ) as BlueprintItemWire[];

          for (let wireItem of wireItems) {
            let connectionsArray = DrawHelpers.getConnectionArray(
              wireItem.connections
            );
            for (let direction = 0; direction < 4; direction++) {
              if (
                connectionsArray[direction] &&
                zoneIntersectsRect(
                  direction,
                  localX0,
                  localY0,
                  localX1,
                  localY1
                )
              )
                this.disconnectBit(wireItem, direction);
            }
          }
        }
      }
    } finally {
      this.blueprintService.blueprint.resumeChangeEvents();
    }
  }

  // Tool interface :
  switchFrom() {
    this.beginSelection = null;
    this.endSelection = null;
  }

  switchTo() {
    // required by type
  }

  mouseOut() {}

  mouseDown(_tile: Vector2, tileFloat?: Vector2) {
    this.beginSelection = Vector2.clone(tileFloat ?? undefined);
    this.endSelection = null;
  }

  leftClick(_tile: Vector2) {}

  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }

  hover(_tile: Vector2) {}

  drag(tileStart: Vector2, tileStop: Vector2) {
    if (this.beginSelection == null)
      this.beginSelection = Vector2.clone(tileStart)!;
    this.endSelection = Vector2.clone(tileStop)!;
  }

  dragStop() {
    if (this.beginSelection != null)
      this.cutBox(
        this.beginSelection,
        this.endSelection ?? this.beginSelection
      );

    this.beginSelection = null;
    this.endSelection = null;
  }

  keyDown(_keyCode: string) {}

  draw(drawPixi: DrawPixi, camera: CameraService) {
    if (this.beginSelection == null) return;

    let end = this.endSelection ?? this.beginSelection;

    let topLeft = new Vector2(
      Math.min(this.beginSelection.x, end.x),
      Math.max(this.beginSelection.y, end.y)
    );
    let bottomRight = new Vector2(
      Math.max(this.beginSelection.x, end.x),
      Math.min(this.beginSelection.y, end.y)
    );

    drawPixi.drawTileRectangle(
      camera,
      topLeft,
      bottomRight,
      true,
      2,
      0xff4c00,
      0x963300,
      0.25,
      0.8
    );
  }

  toggleable: boolean = false;
  visible: boolean = false;
  captureInput: boolean = true;
  toolType = ToolType.scissors;
  toolGroup: number = 1;
}
