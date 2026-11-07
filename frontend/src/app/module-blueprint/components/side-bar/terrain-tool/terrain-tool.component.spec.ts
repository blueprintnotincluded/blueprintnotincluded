import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniTerrainFeature,
  BniWorldNote,
  BTerrainFeature,
  BuildableElement,
  TerrainFeature,
} from "../../../../../../../lib/index";
import { TerrainToolComponent } from "./terrain-tool.component";
import { TerrainTool } from "../../../common/tools/terrain-tool";
import { BlueprintService } from "../../../services/blueprint-service";
import { TerrainAnnotationService } from "../../../services/terrain-annotation.service";

const GEYSERS: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
  },
  { id: "OilWell", name: "Oil Reservoir", width: 4, height: 2, dlcIds: [] },
  {
    id: "GeyserGeneric_big_volcano",
    name: "Volcano",
    width: 3,
    height: 3,
    dlcIds: [],
  },
];
// Catalogue order is by prefab id, which puts Mealwood ("BasicSingle…") before
// Arbor Tree ("ForestTree") — the palette must not.
const PLANTS: BTerrainFeature[] = [
  {
    id: "BasicSingleHarvestPlant",
    name: "Mealwood",
    width: 1,
    height: 2,
    dlcIds: [],
    kind: "plant",
  },
  {
    id: "ForestTree",
    name: "Arbor Tree",
    width: 1,
    height: 1,
    dlcIds: [],
    kind: "plant",
  },
  {
    id: "PrickleFlower",
    name: "Bristle Blossom",
    width: 1,
    height: 2,
    dlcIds: [],
    kind: "plant",
  },
];

// The palette shows geysers and plants on two tabs over one catalogue. The tab
// is not state of its own: it follows the tool's current feature, so the tool
// and the card can never disagree about what the next click places.
describe("TerrainToolComponent", () => {
  let component: TerrainToolComponent;
  let tool: TerrainTool;

  function load(catalogue: BTerrainFeature[]) {
    TerrainFeature.init();
    TerrainFeature.load(catalogue);
    BuildableElement.init();
    BuildableElement.load([]);
    const blueprint: {
      terrainFeatures: BniTerrainFeature[];
      worldNotes: BniWorldNote[];
      emitBlueprintChanged: ReturnType<typeof vi.fn>;
    } = { terrainFeatures: [], worldNotes: [], emitBlueprintChanged: vi.fn() };
    const blueprintService = { blueprint } as unknown as BlueprintService;
    const terrainService = new TerrainAnnotationService(blueprintService);
    tool = new TerrainTool(blueprintService, terrainService);
    tool.switchTo();
    component = new TerrainToolComponent(tool, terrainService);
  }

  beforeEach(() => load([...GEYSERS, ...PLANTS]));

  it("opens on the geysers tab and lists only geysers there, by name", () => {
    expect(component.kind).toBe("terrain");
    expect(component.features.map((f) => f.name)).toEqual([
      "Cool Steam Vent",
      "Oil Reservoir",
      "Volcano",
    ]);
    expect(component.hasPlants).toBe(true);
  });

  // No search in the palette, so the order has to be the one a reader scans:
  // the display name, not the prefab id behind it.
  it("lists plants alphabetically by display name, not by prefab id", () => {
    component.showKind("plant");
    expect(component.features.map((f) => f.name)).toEqual([
      "Arbor Tree",
      "Bristle Blossom",
      "Mealwood",
    ]);
  });

  it("moves the tool onto the first listed plant when the plants tab is picked", () => {
    component.showKind("plant");

    expect(tool.featureId).toBe("ForestTree");
    expect(component.kind).toBe("plant");
  });

  it("follows the tool's feature rather than holding a tab of its own", () => {
    tool.featureId = "PrickleFlower";
    expect(component.kind).toBe("plant");
    tool.featureId = "OilWell";
    expect(component.kind).toBe("terrain");
  });

  it("keeps the current feature when its own tab is picked again", () => {
    tool.featureId = "OilWell";
    component.showKind("terrain");
    expect(tool.featureId).toBe("OilWell");
  });

  // An older database with no plants gets the single-list palette it had.
  it("hides the tabs for a catalogue without plants", () => {
    load(GEYSERS);
    expect(component.hasPlants).toBe(false);
    component.showKind("plant");
    expect(component.kind).toBe("terrain");
    expect(component.features).toHaveLength(3);
  });
});
