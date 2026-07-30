import {
  BniTerrainFeature,
  BTerrainFeature,
  TerrainFeature,
} from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";
import {
  TerrainAnnotationService,
  findTerrainFeatureAt,
  terrainFootprint,
} from "./terrain-annotation.service";

const CATALOGUE: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
  },
  { id: "OilWell", name: "Oil Reservoir", width: 4, height: 2, dlcIds: [] },
];

describe("terrain annotation geometry", () => {
  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
  });

  it("reads the footprint from the catalogue", () => {
    expect(terrainFootprint({ id: "OilWell", x: 0, y: 0 })).toEqual({
      width: 4,
      height: 2,
    });
  });

  // An unknown id is kept, never dropped — but it still has to be clickable,
  // or the user could see a marker they cannot select or delete.
  it("falls back to a single cell for an id the database does not know", () => {
    expect(terrainFootprint({ id: "SomeModdedGeyser", x: 0, y: 0 })).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("hits anywhere inside the footprint, anchored bottom-left", () => {
    const features: BniTerrainFeature[] = [{ id: "OilWell", x: 10, y: 20 }];

    for (const tile of [
      { x: 10, y: 20 },
      { x: 13, y: 20 },
      { x: 10, y: 21 },
      { x: 13, y: 21 },
      { x: 12, y: 21 },
    ])
      expect(findTerrainFeatureAt(features, tile), JSON.stringify(tile)).toBe(
        features[0],
      );

    for (const tile of [
      { x: 9, y: 20 },
      { x: 14, y: 20 },
      { x: 10, y: 19 },
      { x: 10, y: 22 },
    ])
      expect(findTerrainFeatureAt(features, tile), JSON.stringify(tile)).toBe(
        null,
      );
  });

  it("resolves overlapping annotations last-wins", () => {
    const features: BniTerrainFeature[] = [
      { id: "OilWell", x: 0, y: 0 },
      { id: "GeyserGeneric_steam", x: 1, y: 0 },
    ];
    expect(findTerrainFeatureAt(features, { x: 1, y: 0 })).toBe(features[1]);
    expect(findTerrainFeatureAt(features, { x: 0, y: 0 })).toBe(features[0]);
  });

  it("tolerates a missing feature list", () => {
    expect(findTerrainFeatureAt(null, { x: 0, y: 0 })).toBe(null);
    expect(findTerrainFeatureAt(undefined, { x: 0, y: 0 })).toBe(null);
  });
});

describe("TerrainAnnotationService", () => {
  let service: TerrainAnnotationService;
  let blueprint: {
    terrainFeatures: BniTerrainFeature[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    blueprint = { terrainFeatures: [], emitBlueprintChanged: vi.fn() };
    service = new TerrainAnnotationService({
      blueprint,
    } as unknown as BlueprintService);
  });

  it("adds an annotation, selects it, and notifies the blueprint", () => {
    const feature: BniTerrainFeature = { id: "OilWell", x: 2, y: 3 };
    service.add(feature);

    expect(blueprint.terrainFeatures).toEqual([feature]);
    expect(service.selected).toBe(feature);
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalled();
  });

  // Selection is keyed by cell rather than by object reference because
  // undo/redo rebuilds the array through importFromMdb, which would dangle a
  // held reference.
  it("re-resolves the selection after the array is rebuilt", () => {
    service.add({ id: "OilWell", x: 2, y: 3 });
    const rebuilt = { id: "OilWell", x: 2, y: 3 };
    blueprint.terrainFeatures = [rebuilt];

    expect(service.selected).toBe(rebuilt);
  });

  it("gives commit a new array identity so the overlay recomputes", () => {
    service.add({ id: "OilWell", x: 2, y: 3 });
    const before = blueprint.terrainFeatures;
    service.commit();

    expect(blueprint.terrainFeatures).not.toBe(before);
    expect(blueprint.terrainFeatures).toEqual(before);
  });

  it("moves an annotation and keeps it selected at its new anchor", () => {
    const feature: BniTerrainFeature = { id: "OilWell", x: 2, y: 3 };
    service.add(feature);
    service.move(feature, { x: 9, y: 9 });

    expect(feature).toEqual({ id: "OilWell", x: 9, y: 9 });
    expect(service.selected).toBe(feature);
  });

  it("clears the selection when the selected annotation is deleted", () => {
    const feature: BniTerrainFeature = { id: "OilWell", x: 2, y: 3 };
    service.add(feature);
    service.delete(feature);

    expect(blueprint.terrainFeatures).toEqual([]);
    expect(service.selected).toBe(null);
  });

  it("keeps another annotation selected when a different one is deleted", () => {
    const kept: BniTerrainFeature = { id: "OilWell", x: 0, y: 0 };
    const removed: BniTerrainFeature = { id: "OilWell", x: 10, y: 10 };
    service.add(removed);
    service.add(kept);
    service.delete(removed);

    expect(service.selected).toBe(kept);
  });

  // Visibility is view state only: it must never reach what is stored.
  it("toggling visibility drops the selection but not the data", () => {
    const feature: BniTerrainFeature = { id: "OilWell", x: 2, y: 3 };
    service.add(feature);
    service.toggleVisible();

    expect(service.visible).toBe(false);
    expect(service.selected).toBe(null);
    expect(blueprint.terrainFeatures).toEqual([feature]);

    service.toggleVisible();
    expect(service.visible).toBe(true);
  });
});
