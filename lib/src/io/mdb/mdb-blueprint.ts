import { MdbBuilding } from './mdb-building';
import { BniDigCommand, BniPlanShape, BniWorldNote } from '../bni/bni-blueprint';
import { BniTerrainFeature } from '../../blueprint/terrain-metadata';

export interface MdbBlueprint {
  blueprintItems: MdbBuilding[];
  planningToolShapes?: BniPlanShape[];
  worldNotes?: BniWorldNote[];
  // The file's real dig commands (the ones that are not just a Planning Tool
  // shape's cell). Omitted when empty, so every stored blueprint without any
  // keeps its exact shape and fingerprint.
  digCommands?: BniDigCommand[];
  // Natural terrain features (geysers, vents, volcanoes) annotated on the
  // blueprint. Stored decoded here — the JSON-string encoding is a BlueprintsV2
  // transport detail, applied only when writing a .blueprint file.
  terrainFeatures?: BniTerrainFeature[];
  // Every `metadata` key we do not own, carried verbatim so that re-saving a
  // blueprint in our editor never destroys another tool's annotations.
  foreignMetadata?: Record<string, string>;
}
