import { StringHelpers } from '../string-helpers';
// Natural map features — geysers, vents, volcanoes, fissures, oil reservoirs,
// and the wild plants and trees that grow on the map. Dupes cannot build
// these: they are *annotations* that record what the surrounding map already
// contains ("this pump array sits on a chlorine vent", "these ladders thread
// an arbor tree"), not construction. They are deliberately kept out of every
// build-related model — no BlueprintItem, no material cost, no build order, and
// never an entry in the exported `buildings` array (a geyser written as a
// building resolves to a null BuildingDef in the BlueprintsV2 mod, which then
// rejects the whole config).
//
// The catalogue is generated from the game's own export by `npm run import:2024`
// (`terrainFeatures` in database-2024.json) and loaded here the same way
// BuildableElement loads `elements` — see convert-export-2024.ts for the
// sources (geyser.json plus the GeyserFeature-tagged entities and OilWell from
// entities.json; plants are the Plant-tagged entities of the same file).

// What a catalogue entry is. One catalogue and one annotation list for both,
// because a blueprint stores only the prefab id and the kind is a property of
// the prefab, not of the placement — so a plant costs no new storage schema
// and an older client reading a plant id simply sees an unknown feature, which
// it already keeps and renders as a placeholder. The kind decides what differs
// in the editor: a geyser has an active cell and sits on neutronium, a plant
// has neither.
export type TerrainFeatureKind = 'terrain' | 'plant';

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
  // Absent ⇒ 'terrain': the field postdates the geyser catalogue, and every
  // entry written before it was a geyser, vent, volcano or reservoir.
  kind?: TerrainFeatureKind;
  // Footprint-relative offset of the one cell the feature actually acts on —
  // where a geyser erupts, a volcano vents. The rest of the footprint is
  // scenery. NOT uniform: a volcano erupts from the middle of its 3x3 (1,1),
  // a geyser from the left of its footprint (0,1). The importer decides which
  // from the game's own `geyserType.shape`, so the split lives in data rather
  // than in render code. Plants have none: nothing about a plant acts on a
  // cell, so the importer omits the field and the editor shows no such cell.
  activeTile?: { x: number; y: number };
  // Where the flat icon sits over the footprint, in cells, origin at the
  // footprint's bottom-left, +y up — the same contract as BBuildingDef2024's
  // uiImageRect, and sourced from the same export file (ui_image_rects.json).
  // Terrain icons are tight-cropped ~200 px/cell renders, so stretching one to
  // the footprint both squashes its aspect and throws away the overhang the
  // render was framed to include. Absent ⇒ the renderer falls back to that
  // stretch (a database predating the field, or an id we do not know).
  uiImageRect?: { x: number; y: number; w: number; h: number };
}

export class TerrainFeature implements BTerrainFeature {
  id: string = '';
  name: string = '';
  width: number = 1;
  height: number = 1;
  dlcIds: string[] = [];
  kind: TerrainFeatureKind = 'terrain';
  // Meaningful only for kind 'terrain' — see activeTileOf in terrain-markers.
  activeTile: { x: number; y: number } = { x: 1, y: 1 };
  // Undefined rather than a footprint-sized default: the renderer distinguishes
  // "placed by measurement" from "no rect, stretch it" — see BTerrainFeature.
  uiImageRect?: { x: number; y: number; w: number; h: number };

  // Generated: the export ships one flat icon per feature prefab, named after
  // the prefab id, synced into both asset roots by the importer.
  iconUrl: string = '';
  // Menu-sized rendition for <img> tags (see StringHelpers.iconThumbUrl).
  thumbUrl: string = '';

  public importFrom(original: BTerrainFeature) {
    this.id = original.id;
    this.name = original.name;
    // A malformed or truncated catalogue entry must still render as *something*
    // placeable rather than collapsing to a zero-area footprint.
    this.width = original.width > 0 ? original.width : 1;
    this.height = original.height > 0 ? original.height : 1;
    this.dlcIds = original.dlcIds != null ? [...original.dlcIds] : [];
    // Anything that is not a plant is terrain: the only other value the
    // catalogue has ever written, and what a database predating the field means.
    this.kind = original.kind === 'plant' ? 'plant' : 'terrain';
    // A database predating the field has no offsets at all. Fall back to the
    // volcano cell rather than (0,0): there is no single correct answer once
    // volcanoes and geysers differ, and (1,1) is inside every footprint in the
    // catalogue, whereas the corner would look deliberate and be wrong.
    this.activeTile =
      original.activeTile != null ? { ...original.activeTile } : { x: 1, y: 1 };
    // Clamp into the footprint: a 1-wide or 1-tall feature (none today, but the
    // catalogue is game data) must not put its active cell outside itself.
    this.activeTile.x = Math.min(this.activeTile.x, this.width - 1);
    this.activeTile.y = Math.min(this.activeTile.y, this.height - 1);
    // A zero/negative-area rect would collapse the icon to nothing, which is
    // worse than the stretch fallback it would be replacing.
    this.uiImageRect =
      original.uiImageRect != null &&
      original.uiImageRect.w > 0 &&
      original.uiImageRect.h > 0
        ? { ...original.uiImageRect }
        : undefined;
    this.iconUrl = StringHelpers.flatIconUrl(this.id);
    this.thumbUrl = StringHelpers.iconThumbUrl(this.id);
  }

  get isPlant(): boolean {
    return this.kind === 'plant';
  }

  // static
  public static features: TerrainFeature[] = [];
  private static featuresMap: Map<string, TerrainFeature> = new Map();

  // The palette shows the two kinds apart — a geyser and a Mealwood share a
  // storage model, not a mental one — so the catalogue is queried by kind.
  public static byKind(kind: TerrainFeatureKind): TerrainFeature[] {
    return TerrainFeature.features.filter((f) => f.kind === kind);
  }

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
