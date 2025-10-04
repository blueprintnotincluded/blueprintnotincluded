import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { DrawHelpers } from '../drawing/draw-helpers';
import { Vector2 } from '../vector2';

export class BlueprintItemTile extends BlueprintItem {
  private tileConnections_: number = 0;
  public get tileConnections() {
    return this.tileConnections_;
  }
  public set tileConnections(value: number) {
    if (value != this.tileConnections_) this.reloadCamera = true;
    this.tileConnections_ = value;
  }

  constructor(id: string) {
    super(id);
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
        drawPart.makeEverythingButThisTagInvisible(DrawHelpers.connectionTag[this.tileConnections]);
  }

  public updateTileables(blueprint: Blueprint) {
    let tempConnection = 0;

    if (
      blueprint
        .getBlueprintItemsAt(new Vector2(this.position.x - 1, this.position.y))
        .filter(b => b.id == this.id).length > 0
    )
      tempConnection += 1;
    if (
      blueprint
        .getBlueprintItemsAt(new Vector2(this.position.x + 1, this.position.y))
        .filter(b => b.id == this.id).length > 0
    )
      tempConnection += 2;
    if (
      blueprint
        .getBlueprintItemsAt(new Vector2(this.position.x, this.position.y + 1))
        .filter(b => b.id == this.id).length > 0
    )
      tempConnection += 4;
    if (
      blueprint
        .getBlueprintItemsAt(new Vector2(this.position.x, this.position.y - 1))
        .filter(b => b.id == this.id).length > 0
    )
      tempConnection += 8;

    this.tileConnections = tempConnection;
  }
}
