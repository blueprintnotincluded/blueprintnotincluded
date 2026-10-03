import { MdbBuilding } from './mdb-building';
import { BniDigCommand, BniPlanShape, BniWorldNote } from '../bni/bni-blueprint';
import { BniTerrainFeature } from '../../blueprint/terrain-metadata';
export interface MdbBlueprint {
    blueprintItems: MdbBuilding[];
    planningToolShapes?: BniPlanShape[];
    worldNotes?: BniWorldNote[];
    digCommands?: BniDigCommand[];
    terrainFeatures?: BniTerrainFeature[];
    foreignMetadata?: Record<string, string>;
}
//# sourceMappingURL=mdb-blueprint.d.ts.map