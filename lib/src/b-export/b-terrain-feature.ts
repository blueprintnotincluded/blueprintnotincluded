// Natural terrain features — geysers, vents, volcanoes, fissures, oil
// reservoirs. Dupes cannot build these: they are *annotations* that record what
// the surrounding map already contains ("this pump array sits on a chlorine
// vent"), not construction. They are deliberately kept out of every
// build-related model — no BlueprintItem, no material cost, no build order, and
// never an entry in the exported `buildings` array (a geyser written as a
// building resolves to a null BuildingDef in the BlueprintsV2 mod, which then
// rejects the whole config).
//
// The catalogue is generated from the game's own export by `npm run import:2024`
// (`terrainFeatures` in database-2024.json) and loaded here the same way
// BuildableElement loads `elements` — see convert-export-2024.ts for the
// sources (geyser.json plus the GeyserFeature-tagged entities and OilWell from
// entities.json).

// The shape stored in database-2024.json.
export interface BTerrainFeature {
  // The real ONI prefab id (e.g. 'GeyserGeneric_chlorine_gas'). This is what we
  // persist in blueprints, so the data stays meaningful to the mod and to any
  // other tool that reads it — never an invented slug.
  id: string;
  // Display name, already stripped of Klei rich-text markup. Unlike buildings
  // and elements — whose names the frontend re-resolves by string key through
  // GameStringService — terrain names are read straight off this catalogue, so
  // the importer strips them once rather than at every call site.
  name: string;
  // Footprint in cells, from game data. Features are not uniformly sized:
  // a Cool Steam Vent is 2x4, an Oil Reservoir 4x2.
  width: number;
  height: number;
  // Raw Klei DLC ids required by the feature; [] for base game.
  dlcIds: string[];
}

export class TerrainFeature implements BTerrainFeature {
  id: string = '';
  name: string = '';
  width: number = 1;
  height: number = 1;
  dlcIds: string[] = [];

  // Generated: the export ships one flat icon per feature prefab, named after
  // the prefab id, synced into both asset roots by the importer.
  iconUrl: string = '';

  public importFrom(original: BTerrainFeature) {
    this.id = original.id;
    this.name = original.name;
    // A malformed or truncated catalogue entry must still render as *something*
    // placeable rather than collapsing to a zero-area footprint.
    this.width = original.width > 0 ? original.width : 1;
    this.height = original.height > 0 ? original.height : 1;
    this.dlcIds = original.dlcIds != null ? [...original.dlcIds] : [];
    this.iconUrl = 'assets/ui_image/' + this.id + '.png';
  }

  // static
  public static features: TerrainFeature[] = [];
  private static featuresMap: Map<string, TerrainFeature> = new Map();

  public static init() {
    TerrainFeature.features = [];
    TerrainFeature.featuresMap = new Map();
  }

  public static load(originals: BTerrainFeature[] | null | undefined) {
    // Databases predating the terrain catalogue simply have no features. That
    // must degrade to an empty palette, not a crash on startup.
    for (const original of originals ?? []) {
      const feature = new TerrainFeature();
      feature.importFrom(original);
      TerrainFeature.features.push(feature);
      TerrainFeature.featuresMap.set(feature.id, feature);
    }
  }

  // Undefined for an id this database doesn't know. Callers must keep the
  // annotation and render a placeholder rather than dropping data we don't
  // recognise — an id can be newer than our export, or come from a mod.
  public static getFeature(id: string): TerrainFeature | undefined {
    return TerrainFeature.featuresMap.get(id);
  }
}
