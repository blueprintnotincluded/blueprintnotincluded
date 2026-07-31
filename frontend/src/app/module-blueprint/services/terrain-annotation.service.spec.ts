import {
  BniTerrainFeature,
  BniWorldNote,
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
    worldNotes: BniWorldNote[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    // No Neutronium in the element table by default, so the base-seeding tests
    // opt in explicitly and every other test exercises the graceful no-base path.
    BuildableElement.init();
    BuildableElement.load([]);

    blueprint = {
      terrainFeatures: [],
      worldNotes: [],
      emitBlueprintChanged: vi.fn(),
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

  // In the game every geyser sits on neutronium, so placing one seeds that row
  // as element world notes — the mod's own way of saying "this cell holds this
  // material", so unlike an element cell it survives the trip back into game.
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
    });

    it("seeds one row, as wide as the footprint, directly beneath the anchor", () => {
      // OilWell is 4x2, anchored bottom-left at (10, 20).
      service.add({ id: "OilWell", x: 10, y: 20 });

      expect(blueprint.worldNotes).toHaveLength(4);
      expect(blueprint.worldNotes.map((n) => ({ x: n.x, y: n.y }))).toEqual([
        { x: 10, y: 19 },
        { x: 11, y: 19 },
        { x: 12, y: 19 },
        { x: 13, y: 19 },
      ]);
    });

    // Type 1 is BlueprintNoteData.NoteType.Element; the mod writes only
    // id/mass/temp for it, so those three are the whole payload.
    it("writes each cell as an element note carrying Neutronium", () => {
      service.add({ id: "GeyserGeneric_steam", x: 0, y: 0 });

      expect(blueprint.worldNotes[0]).toEqual({
        x: 0,
        y: -1,
        type: 1,
        id: NEUTRONIUM.tag,
        mass: NEUTRONIUM.defaultMass,
        temp: NEUTRONIUM.defaultTemperature,
      });
    });

    it("matches a narrower footprint", () => {
      // Cool Steam Vent is 2 wide.
      service.add({ id: "GeyserGeneric_steam", x: 0, y: 0 });
      expect(blueprint.worldNotes).toHaveLength(2);
    });

    it("gives an unknown feature a single-cell base", () => {
      service.add({ id: "SomeModdedGeyser", x: 5, y: 5 });
      expect(blueprint.worldNotes).toHaveLength(1);
    });

    // The user is meant to customize the base with the note tool, so a note
    // already at that cell must never be replaced by the default.
    it("never stacks a second note where one already exists", () => {
      service.add({ id: "OilWell", x: 10, y: 20 });
      service.add({ id: "OilWell", x: 10, y: 20 });
      expect(blueprint.worldNotes).toHaveLength(4);
    });

    it("leaves a note the user already placed alone", () => {
      const theirs: BniWorldNote = { x: 10, y: 19, type: 0, text: "mine" };
      blueprint.worldNotes = [theirs];
      service.add({ id: "OilWell", x: 10, y: 20 });

      expect(blueprint.worldNotes).toHaveLength(4);
      expect(blueprint.worldNotes[0]).toBe(theirs);
    });

    // The annotation and its base are one edit, so they are one undo step.
    it("emits a single change event for the annotation and its base", () => {
      service.add({ id: "OilWell", x: 10, y: 20 });
      expect(blueprint.emitBlueprintChanged).toHaveBeenCalledTimes(1);
    });

    // The notes overlay caches by array identity, so a push alone would not
    // redraw.
    it("gives worldNotes a new array identity", () => {
      const before = blueprint.worldNotes;
      service.add({ id: "OilWell", x: 10, y: 20 });
      expect(blueprint.worldNotes).not.toBe(before);
    });

    // Seeded, not owned: deleting the annotation leaves notes the user may
    // have since edited.
    it("leaves the base behind when the annotation is deleted", () => {
      const feature: BniTerrainFeature = { id: "OilWell", x: 10, y: 20 };
      service.add(feature);
      service.delete(feature);

      expect(blueprint.terrainFeatures).toEqual([]);
      expect(blueprint.worldNotes).toHaveLength(4);
    });
  });

  // A database predating Neutronium (or any element table that lacks it) gets
  // the annotation and no base, rather than a crash.
  it("places no base when the database has no Neutronium", () => {
    service.add({ id: "OilWell", x: 0, y: 0 });
    expect(blueprint.worldNotes).toHaveLength(0);
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
