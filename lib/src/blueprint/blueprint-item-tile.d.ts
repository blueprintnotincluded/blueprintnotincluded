import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
export declare class BlueprintItemTile extends BlueprintItem {
    private tileConnections_;
    get tileConnections(): number;
    set tileConnections(value: number);
    constructor(id: string);
    cameraChanged(camera: CameraService): void;
    modulateSelectedTint(camera: CameraService): void;
    modulateBuildCandidateTint(camera: CameraService): void;
    private updateDrawPartVisibilityBasedOnConnections;
    updateTileables(blueprint: Blueprint): void;
}
//# sourceMappingURL=blueprint-item-tile.d.ts.map