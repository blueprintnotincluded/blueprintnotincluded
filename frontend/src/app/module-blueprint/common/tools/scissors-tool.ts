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

const SCISSORS_COLOR = 0xffc341;
const READY_ICON_URL = "assets/images/disconnect-ready.png";
// Fraction of one tile's on-screen height the ready icon is sized to.
const READY_ICON_TILE_FRACTION = 0.7;

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

  // Created lazily on first draw() and reused every frame after that (see
  // DrawMiniUi for the same create-once-mutate-per-frame sprite pattern).
  private readyIcon: any = null;

  private neighborTile(tile: Vector2, direction: number): Vector2 {
    const offset = DrawHelpers.connectionVectors[direction];
    return new Vector2(tile.x + offset.x, tile.y + offset.y);
  }

  private disconnectBit(item: BlueprintItemWire, direction: number) {
    const connectionsArray = DrawHelpers.getConnectionArray(item.connections);
    if (!connectionsArray[direction]) return;

    connectionsArray[direction] = false;
    item.connections = DrawHelpers.getConnection(connectionsArray);
    item.updateTileables(this.blueprintService.blueprint);

    const neighborPosition = this.neighborTile(item.position, direction);

    const neighborItems = this.blueprintService.blueprint
      .getBlueprintItemsAt(neighborPosition)
      .filter(
        (i) =>
          i.oniItem.isWire && i.oniItem.objectLayer == item.oniItem.objectLayer,
      );

    for (const neighborItem of neighborItems) {
      const neighborWire = neighborItem as BlueprintItemWire;
      const neighborArray = DrawHelpers.getConnectionArray(
        neighborWire.connections,
      );
      neighborArray[DrawHelpers.connectionBitsOpposite[direction]] = false;
      neighborWire.connections = DrawHelpers.getConnection(neighborArray);
      neighborWire.updateTileables(this.blueprintService.blueprint);
    }
  }

  // Cuts the single connection (if any) between `tile` and its neighbour in
  // `direction`, restricted to connectables on the currently viewed overlay.
  private cutBetween(tile: Vector2, direction: number) {
    const currentOverlay = CameraService.cameraService?.overlay;

    this.blueprintService.blueprint.pauseChangeEvents();

    try {
      const wireItems = this.blueprintService.blueprint
        .getBlueprintItemsAt(tile)
        .filter(
          (i) => i.oniItem.isWire && i.oniItem.isOverlayPrimary(currentOverlay),
        ) as BlueprintItemWire[];

      for (const wireItem of wireItems) {
        const connectionsArray = DrawHelpers.getConnectionArray(
          wireItem.connections,
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
    if (this.readyIcon != null) this.readyIcon.visible = false;
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

    const currentTile = DrawHelpers.getIntegerTile(tileStop);
    if (currentTile.equals(this.startTile!)) {
      this.direction = null;
      return;
    }

    const deltaX = tileStop.x - this.startFloat.x;
    const deltaY = tileStop.y - this.startFloat.y;

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

  private ensureReadyIcon(drawPixi: DrawPixi): any {
    if (this.readyIcon == null) {
      this.readyIcon = drawPixi.getSpriteFrom(READY_ICON_URL);
      this.readyIcon.tint = SCISSORS_COLOR;
      this.readyIcon.anchor.set(0.5, 0.5);
      drawPixi.pixiApp.stage.addChild(this.readyIcon);
    }
    return this.readyIcon;
  }

  // Positions/rotates/shows the "ready to cut" icon at the midpoint of the
  // two selected tiles, or hides it while there's no two-tile selection yet.
  private updateReadyIcon(drawPixi: DrawPixi, camera: CameraService) {
    const icon = this.ensureReadyIcon(drawPixi);

    if (this.startTile == null || this.direction == null) {
      icon.visible = false;
      return;
    }

    // The source art is oriented for a horizontal (Left/Right) selection —
    // a vertical dashed cut line between two side-by-side tiles — so a
    // vertical (Up/Down) selection needs the icon rotated 90 degrees.
    icon.angle = this.direction == UP || this.direction == DOWN ? 90 : 0;

    if (icon.texture.height > 0) {
      icon.scale.set(
        (READY_ICON_TILE_FRACTION * camera.currentZoom) / icon.texture.height,
      );
    }

    const neighbor = this.neighborTile(this.startTile, this.direction);
    const centerWorld = new Vector2(
      (this.startTile.x + neighbor.x) / 2 + 0.5,
      (this.startTile.y + neighbor.y) / 2 - 0.5,
    );

    icon.position.x =
      (centerWorld.x + camera.cameraOffset.x) * camera.currentZoom;
    icon.position.y =
      (-centerWorld.y + camera.cameraOffset.y) * camera.currentZoom;
    icon.visible = true;
  }

  draw(drawPixi: DrawPixi, camera: CameraService) {
    this.updateReadyIcon(drawPixi, camera);

    if (this.startTile == null) return;

    const tiles =
      this.direction == null
        ? [this.startTile]
        : [this.startTile, this.neighborTile(this.startTile, this.direction)];

    const topLeft = new Vector2(
      Math.min(...tiles.map((t) => t.x)),
      Math.max(...tiles.map((t) => t.y)),
    );
    const bottomRight = new Vector2(
      Math.max(...tiles.map((t) => t.x)) + 1,
      Math.min(...tiles.map((t) => t.y)) - 1,
    );

    drawPixi.drawTileRectangle(
      camera,
      topLeft,
      bottomRight,
      true,
      2,
      SCISSORS_COLOR,
      SCISSORS_COLOR,
      0.25,
      1,
    );
  }

  toggleable: boolean = false;
  visible: boolean = false;
  captureInput: boolean = true;
  toolType = ToolType.scissors;
  toolGroup: number = 1;
}
