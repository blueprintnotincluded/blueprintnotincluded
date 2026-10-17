import { BlueprintItem } from './blueprint-item';
import { BlueprintItemElement } from './blueprint-item-element';
import { BniTerrainFeature } from './terrain-metadata';
import { BniDigCommand, BniWorldNote } from '../io/bni/bni-blueprint';
import { Vector2 } from '../vector2';
export declare function findNoteAt(notes: BniWorldNote[] | null | undefined, tile: {
    x: number;
    y: number;
}): BniWorldNote | null;
export declare function terrainFootprint(feature: BniTerrainFeature): {
    width: number;
    height: number;
};
export declare function findTerrainFeatureAt(features: BniTerrainFeature[] | null | undefined, tile: {
    x: number;
    y: number;
}): BniTerrainFeature | null;
export type CellStackEntry = {
    kind: 'note';
    ref: BniWorldNote;
} | {
    kind: 'terrain';
    ref: BniTerrainFeature;
} | {
    kind: 'building';
    ref: BlueprintItem;
} | {
    kind: 'dig';
    ref: BniDigCommand;
} | {
    kind: 'element';
    ref: BlueprintItemElement;
} | {
    kind: 'elementNote';
    ref: BniWorldNote;
};
export interface CellStackVisibility {
    notes: boolean;
    terrain: boolean;
    digs: boolean;
}
export interface CellStackSource {
    worldNotes: BniWorldNote[];
    terrainFeatures: BniTerrainFeature[];
    digCommands: BniDigCommand[];
    getBlueprintItemsAt(position: Vector2): BlueprintItem[];
}
export declare function cellStack(blueprint: CellStackSource, cell: {
    x: number;
    y: number;
}, visibility: CellStackVisibility): CellStackEntry[];
//# sourceMappingURL=cell-stack.d.ts.map