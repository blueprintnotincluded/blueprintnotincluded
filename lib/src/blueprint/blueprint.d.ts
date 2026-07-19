import { BlueprintItem } from './blueprint-item';
import { Vector2 } from '../vector2';
import { OniTemplate } from '../io/oni/oni-template';
import { BniBlueprint, BniPlanShape, BniWorldNote } from '../io/bni/bni-blueprint';
import { MdbBlueprint } from '../io/mdb/mdb-blueprint';
import { Overlay } from '../enums/overlay';
import { UtilityConnectionTracker } from '../utility-connection';
export declare class Blueprint {
    blueprintItems: BlueprintItem[];
    templateTiles: BlueprintItem[][];
    hadUnknownBuildings: boolean;
    unknownBuildingDefs: string[];
    bniMetadata: BniBlueprint | null;
    worldNotes: BniWorldNote[];
    planningToolShapes: BniPlanShape[];
    utilities: UtilityConnectionTracker[][];
    innerYaml: any;
    constructor();
    importFromOni(oniBlueprint: OniTemplate): void;
    importFromBni(bniBlueprint: BniBlueprint): void;
    importFromMdb(mdbBlueprint: MdbBlueprint): void;
    importFromBinary(template: ArrayBuffer): void;
    destroyAndCopyItems(source: Blueprint, emitChanges?: boolean): void;
    prepareOverlayInfo(_currentOverlay: Overlay): void;
    refreshOverlayInfo(): void;
    addBlueprintItem(blueprintItem: BlueprintItem): void;
    destroyBlueprintItem(templateItem: BlueprintItem): void;
    getBlueprintItemsAt(position: Vector2): BlueprintItem[];
    getBlueprintItemsAtIndex(index: number): BlueprintItem[];
    getUtilityConnectionsAtIndex(index: number): UtilityConnectionTracker[];
    private pauseChangeEvents_;
    pauseChangeEvents(): void;
    resumeChangeEvents(emitChanges?: boolean): void;
    observersBlueprintChanged: IObsBlueprintChange[];
    subscribeBlueprintChanged(observer: IObsBlueprintChange): void;
    private emitItemDestroyed;
    private emitItemAdded;
    emitBlueprintChanged(): void;
    toMdbBlueprint(): MdbBlueprint;
    toBniBlueprint(friendlyname: string): BniBlueprint;
    clone(): Blueprint;
    getBoundingBox(): Vector2[];
    sortChildren(): void;
    destroy(emitChanges?: boolean): void;
}
export interface IObsBlueprintChange {
    itemDestroyed(): void;
    itemAdded(blueprintItem: BlueprintItem): void;
    blueprintChanged(): void;
}
//# sourceMappingURL=blueprint.d.ts.map