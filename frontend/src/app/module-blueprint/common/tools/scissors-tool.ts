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

@Injectable()
export class ScissorsTool implements ITool {
  parent!: ToolService;

  constructor(private blueprintService: BlueprintService) {}

  // The tile the drag started in, the float position it started at (used to
  // measure drag direction), and the currently-picked neighbour direction
  // (null while the cursor hasn't left the starting tile yet).
  private startTile: Vector2 | null = null;
  private startFloat: Vector2 | null = null;
  private direction: number | null = null;

  private neighborTile(tile: Vector2, direction: number): Vector2 {
    let offset = DrawHelpers.connectionVectors[direction];
    return new Vector2(tile.x + offset.x, tile.y + offset.y);
  }

  private disconnectBit(item: BlueprintItemWire, direction: number) {
    let connectionsArray = DrawHelpers.getConnectionArray(item.connections);
    if (!connectionsArray[direction]) return;

    connectionsArray[direction] = false;
    item.connections = DrawHelpers.getConnection(connectionsArray);
    item.updateTileables(this.blueprintService.blueprint);

    let neighborPosition = this.neighborTile(item.position, direction);

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

  // Cuts the single connection (if any) between `tile` and its neighbour in
  // `direction`, restricted to connectables on the currently viewed overlay.
  private cutBetween(tile: Vector2, direction: number) {
    let currentOverlay = CameraService.cameraService?.overlay;

    this.blueprintService.blueprint.pauseChangeEvents();

    try {
      let wireItems = this.blueprintService.blueprint
        .getBlueprintItemsAt(tile)
        .filter(
          (i) => i.oniItem.isWire && i.oniItem.isOverlayPrimary(currentOverlay)
        ) as BlueprintItemWire[];

      for (let wireItem of wireItems) {
        let connectionsArray = DrawHelpers.getConnectionArray(
          wireItem.connections
        );
        if (connectionsArray[direction])
          this.disconnectBit(wireItem, direction);
      }
    } finally {
      this.blueprintService.blueprint.resumeChangeEvents();
    }
  }

  // Tool interface :
  switchFrom() {
    this.startTile = null;
    this.startFloat = null;
    this.direction = null;
  }

  switchTo() {
    // required by type
  }

  mouseOut() {}

  mouseDown(tile: Vector2, tileFloat?: Vector2) {
    this.startFloat = Vector2.clone(tileFloat ?? tile)!;
    this.startTile = DrawHelpers.getIntegerTile(this.startFloat);
    this.direction = null;
  }

  leftClick(_tile: Vector2) {}

  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }

  hover(_tile: Vector2) {}

  // tileStart is a delayed/possibly-null sample (see DragAndDropDirective), so
  // direction is measured from the anchor captured in mouseDown, not from it.
  drag(_tileStart: Vector2, tileStop: Vector2) {
    if (tileStop == null) return;

    if (this.startFloat == null) {
      this.startFloat = Vector2.clone(tileStop)!;
      this.startTile = DrawHelpers.getIntegerTile(tileStop);
    }

    let currentTile = DrawHelpers.getIntegerTile(tileStop);
    if (currentTile.equals(this.startTile!)) {
      this.direction = null;
      return;
    }

    let deltaX = tileStop.x - this.startFloat.x;
    let deltaY = tileStop.y - this.startFloat.y;

    if (Math.abs(deltaX) >= Math.abs(deltaY))
      this.direction = deltaX > 0 ? RIGHT : LEFT;
    else this.direction = deltaY > 0 ? UP : DOWN;
  }

  dragStop() {
    if (this.startTile != null && this.direction != null)
      this.cutBetween(this.startTile, this.direction);

    this.startTile = null;
    this.startFloat = null;
    this.direction = null;
  }

  keyDown(_keyCode: string) {}

  draw(drawPixi: DrawPixi, camera: CameraService) {
    if (this.startTile == null) return;

    let tiles =
      this.direction == null
        ? [this.startTile]
        : [this.startTile, this.neighborTile(this.startTile, this.direction)];

    let topLeft = new Vector2(
      Math.min(...tiles.map((t) => t.x)),
      Math.max(...tiles.map((t) => t.y))
    );
    let bottomRight = new Vector2(
      Math.max(...tiles.map((t) => t.x)) + 1,
      Math.min(...tiles.map((t) => t.y)) - 1
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
