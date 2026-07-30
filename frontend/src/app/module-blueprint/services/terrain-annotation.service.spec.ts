import {
  BniTerrainFeature,
  BTerrainFeature,
  BuildableElement,
  NEUTRONIUM_ELEMENT_ID,
  TerrainFeature,
} from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";
import {
  TerrainAnnotationService,
  findTerrainFeatureAt,
  neutroniumBaseCells,
  terrainFootprint,
} from "./terrain-annotation.service";
import { BlueprintHelpers } from "../../../../../lib/index";

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

  // In the game every geyser, vent and volcano is anchored on indestructible
  // neutronium; this is that row.
  describe("neutroniumBaseCells", () => {
    it("is one row, as wide as the footprint, directly beneath the anchor", () => {
      // OilWell is 4x2, anchored bottom-left at (10, 20).
      expect(
        neutroniumBaseCells({ id: "OilWell", x: 10, y: 20 }).map((c) => ({
          x: c.x,
          y: c.y,
        })),
      ).toEqual([
        { x: 10, y: 19 },
        { x: 11, y: 19 },
        { x: 12, y: 19 },
        { x: 13, y: 19 },
      ]);
    });

    it("narrows with the footprint", () => {
      // Cool Steam Vent is 2 wide.
      expect(
        neutroniumBaseCells({ id: "GeyserGeneric_steam", x: 0, y: 0 }),
      ).toHaveLength(2);
    });

    it("gives an unknown feature a single cell", () => {
      expect(
        neutroniumBaseCells({ id: "SomeModdedGeyser", x: 5, y: 5 }),
      ).toEqual([expect.objectContaining({ x: 5, y: 4 })]);
    });

    it("follows a feature into negative coordinates", () => {
      expect(
        neutroniumBaseCells({ id: "GeyserGeneric_steam", x: -3, y: -5 }).map(
          (c) => ({ x: c.x, y: c.y }),
        ),
      ).toEqual([
        { x: -3, y: -6 },
        { x: -2, y: -6 },
      ]);
    });
  });
});

describe("TerrainAnnotationService", () => {
  let service: TerrainAnnotationService;
  let blueprint: {
    terrainFeatures: BniTerrainFeature[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
    pauseChangeEvents: ReturnType<typeof vi.fn>;
    resumeChangeEvents: ReturnType<typeof vi.fn>;
    addBlueprintItem: ReturnType<typeof vi.fn>;
    getBlueprintItemsAt: ReturnType<typeof vi.fn>;
    items: any[];
  };

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    // No Neutronium in the element table by default, so the base-seeding tests
    // opt in explicitly and every other test exercises the graceful no-base path.
    BuildableElement.init();
    BuildableElement.load([]);

    const items: any[] = [];
    blueprint = {
      terrainFeatures: [],
      items,
      emitBlueprintChanged: vi.fn(),
      pauseChangeEvents: vi.fn(),
      // Mirrors the real Blueprint: resuming emits the batched change, which is
      // what turns one placement into exactly one undo snapshot.
      resumeChangeEvents: vi.fn(() => blueprint.emitBlueprintChanged()),
      addBlueprintItem: vi.fn((item: any) => items.push(item)),
      getBlueprintItemsAt: vi.fn((p: { x: number; y: number }) =>
        items.filter((i) => i.position.x === p.x && i.position.y === p.y),
      ),
    };
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

  // Delete is the ordinary editor delete (ShortcutAction.editDelete), wired in
  // the canvas rather than to a panel button, so removing an annotation uses
  // the same action that removes a building. The service is what that handler
  // calls; the handler's decline-when-nothing-selected behaviour is what lets
  // the key fall through to SelectTool.
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

  // In the game every geyser sits on neutronium, so placing one seeds that row.
  describe("neutronium base", () => {
    const NEUTRONIUM = {
      id: NEUTRONIUM_ELEMENT_ID,
      name: "Neutronium",
      tag: 1838482828,
      oreTags: ["Solid", "Special"],
      state: 3,
      maxMass: 20000,
      defaultMass: 20000,
      defaultTemperature: 1,
    };

    beforeEach(() => {
      BuildableElement.init();
      BuildableElement.load([NEUTRONIUM as never]);

      // Element cells are real BlueprintItems, which need the renderer's
      // OniItem/SpriteModifier tables — never stood up in specs. Stub the
      // factory with the small surface seedNeutroniumBase actually touches.
      vi.spyOn(BlueprintHelpers, "createInstance").mockImplementation(
        (id: string) => {
          const cell: any = {
            id,
            position: { x: 0, y: 0 },
            mass: 0,
            temperature: 0,
            buildableElements: [],
            setElement: (elementId: string, index: number) => {
              cell.buildableElements[index] = { id: elementId };
            },
            cleanUp: () => {},
            prepareBoundingBox: () => {},
          };
          return cell;
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("seeds one row, as wide as the footprint, directly beneath the anchor", () => {
      // OilWell is 4x2, anchored bottom-left at (10, 20).
      service.add({ id: "OilWell", x: 10, y: 20 });

      expect(blueprint.items).toHaveLength(4);
      expect(
        blueprint.items.map((i) => ({ x: i.position.x, y: i.position.y })),
      ).toEqual([
        { x: 10, y: 19 },
        { x: 11, y: 19 },
        { x: 12, y: 19 },
        { x: 13, y: 19 },
      ]);
      expect(
        blueprint.items.every(
          (i) => i.buildableElements[0].id === NEUTRONIUM_ELEMENT_ID,
        ),
      ).toBe(true);
    });

    it("matches a narrower footprint", () => {
      // Cool Steam Vent is 2 wide.
      service.add({ id: "GeyserGeneric_steam", x: 0, y: 0 });
      expect(blueprint.items).toHaveLength(2);
    });

    it("gives an unknown feature a single-cell base", () => {
      service.add({ id: "SomeModdedGeyser", x: 5, y: 5 });
      expect(blueprint.items).toHaveLength(1);
    });

    // The user is meant to customize the base with the normal element tool, so
    // a cell they already placed must never be replaced by the default.
    it("never stacks a second cell where one already exists", () => {
      service.add({ id: "OilWell", x: 10, y: 20 });
      service.add({ id: "OilWell", x: 10, y: 20 });
      expect(blueprint.items).toHaveLength(4);
    });

    // The annotation and its base are one edit, so they are one undo step.
    it("batches the annotation and its base into a single change event", () => {
      service.add({ id: "OilWell", x: 10, y: 20 });
      expect(blueprint.pauseChangeEvents).toHaveBeenCalledTimes(1);
      expect(blueprint.resumeChangeEvents).toHaveBeenCalledTimes(1);
    });

    // Seeded, not owned: deleting the annotation leaves cells the user may
    // have since edited.
    it("leaves the base behind when the annotation is deleted", () => {
      const feature: BniTerrainFeature = { id: "OilWell", x: 10, y: 20 };
      service.add(feature);
      service.delete(feature);

      expect(blueprint.terrainFeatures).toEqual([]);
      expect(blueprint.items).toHaveLength(4);
    });
  });

  // A database predating Neutronium (or any element table that lacks it) gets
  // the annotation and no base, rather than a crash.
  it("places no base when the database has no Neutronium", () => {
    service.add({ id: "OilWell", x: 0, y: 0 });
    expect(blueprint.items).toHaveLength(0);
    expect(blueprint.terrainFeatures).toHaveLength(1);
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
