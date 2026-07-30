import { MdbBuilding } from './mdb-building';
import { BniPlanShape, BniWorldNote } from '../bni/bni-blueprint';
import { BniTerrainFeature } from '../../blueprint/terrain-metadata';

export interface MdbBlueprint {
  blueprintItems: MdbBuilding[];
  planningToolShapes?: BniPlanShape[];
  worldNotes?: BniWorldNote[];
  // Natural terrain features (geysers, vents, volcanoes) annotated on the
  // blueprint. Stored decoded here — the JSON-string encoding is a BlueprintsV2
  // transport detail, applied only when writing a .blueprint file.
  terrainFeatures?: BniTerrainFeature[];
  // Every `metadata` key we do not own, carried verbatim so that re-saving a
  // blueprint in our editor never destroys another tool's annotations.
  foreignMetadata?: Record<string, string>;
}
