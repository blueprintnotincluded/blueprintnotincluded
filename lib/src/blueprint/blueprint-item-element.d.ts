import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { MdbBuilding } from '../io/mdb/mdb-building';
export declare class BlueprintItemElement extends BlueprintItem {
    static defaultMass: number;
    mass: number;
    get header(): string;
    constructor(id: string);
    prepareSpriteVisibility(_camera: CameraService): void;
    updateTileables(_blueprint: Blueprint): void;
    drawTemplateItem(_templateItem: BlueprintItem, _camera: CameraService): void;
    importMdbBuilding(original: MdbBuilding): void;
    toMdbBuilding(): MdbBuilding;
    cleanUp(): void;
    cameraChanged(camera: CameraService): void;
    modulateSelectedTint(camera: CameraService): void;
}
//# sourceMappingURL=blueprint-item-element.d.ts.map