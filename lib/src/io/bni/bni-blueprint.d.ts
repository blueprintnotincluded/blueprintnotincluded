import { BniBuilding } from './bni-building';
export interface BniWorldNote {
    x: number;
    y: number;
    type: number;
    title?: string;
    text?: string;
    tinthex?: string;
    id?: number;
    mass?: number;
    temp?: number;
}
export interface BniPlanShape {
    x: number;
    y: number;
    shape: number;
    color: number;
}
export declare class BniBlueprint {
    friendlyname: string;
    buildings: BniBuilding[];
    digcommands: any[];
    blueprintVersion?: number;
    userdesc?: string;
    icon?: string;
    icontint?: string;
    worldNotes?: BniWorldNote[];
    planningtoolmod_shapecollection?: BniPlanShape[];
}
//# sourceMappingURL=bni-blueprint.d.ts.map