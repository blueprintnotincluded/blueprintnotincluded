import { Blueprint } from './blueprint';
import { BlueprintItem } from './blueprint-item';
import { CameraService } from '../drawing/camera-service';
import { MdbBuilding } from '../io/mdb/mdb-building';
export declare enum InfoIcon {
    icon_inf = 0,
    icon_int = 1,
    icon_exc = 2,
    icon_no1 = 3,
    icon_no2 = 4,
    icon_no3 = 5,
    icon_no4 = 6,
    icon_no5 = 7,
    icon_no6 = 8,
    icon_no7 = 9,
    icon_no8 = 10,
    icon_no9 = 11
}
export declare class BlueprintItemInfo extends BlueprintItem {
    static defaultInfoString: string;
    infoString: string;
    static defaultTitle: string;
    title: string;
    static defaultBackColor: number;
    backColor: number;
    static defaultFrontColor: number;
    frontColor: number;
    static defaultIcon: InfoIcon;
    icon: InfoIcon;
    get htmlFrontColor(): string;
    get htmlBackColor(): string;
    get htmlSvgPath(): string;
    constructor(id: string);
    prepareSpriteVisibility(camera: CameraService): void;
    updateTileables(blueprint: Blueprint): void;
    drawTemplateItem(templateItem: BlueprintItem, camera: CameraService): void;
    importMdbBuilding(original: MdbBuilding): void;
    toMdbBuilding(): MdbBuilding;
    cleanUp(): void;
    cameraChanged(camera: CameraService): void;
    modulateSelectedTint(camera: CameraService): void;
    static getIconSvgPath(icon: InfoIcon): string;
}
//# sourceMappingURL=blueprint-item-info.d.ts.map