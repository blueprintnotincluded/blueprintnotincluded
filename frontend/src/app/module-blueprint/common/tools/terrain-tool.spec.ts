import { TerrainTool } from "./terrain-tool";
import { ToolType } from "./tool";
import { ShortcutAction } from "../../keybindings/shortcut-actions";
import {
  BniTerrainFeature,
  BTerrainFeature,
  TerrainFeature,
  Vector2,
} from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import { TerrainAnnotationService } from "../../services/terrain-annotation.service";

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

describe("TerrainTool", () => {
  let tool: TerrainTool;
  let blueprint: {
    terrainFeatures: BniTerrainFeature[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };
  let terrainService: TerrainAnnotationService;
  let parent: { changeTool: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    blueprint = { terrainFeatures: [], emitBlueprintChanged: vi.fn() };
    const blueprintService = { blueprint } as unknown as BlueprintService;
    terrainService = new TerrainAnnotationService(blueprintService);
    tool = new TerrainTool(blueprintService, terrainService);
    parent = { changeTool: vi.fn() };
    tool.parent = parent as any;
  });

  it("is an exclusive input tool", () => {
    expect(tool.toolType).toBe(ToolType.terrain);
    expect(tool.toolGroup).toBe(1);
    expect(tool.captureInput).toBe(true);
    expect(tool.toggleable).toBe(false);
  });

  it("places the selected feature at the clicked cell and selects it", () => {
    tool.featureId = "OilWell";
    tool.mouseDown(new Vector2(4, 5));

    expect(blueprint.terrainFeatures).toEqual([{ id: "OilWell", x: 4, y: 5 }]);
    expect(terrainService.selected).toBe(blueprint.terrainFeatures[0]);
  });

  // v1 stores position and type only — free text belongs in a world note.
  it("stores nothing beyond id and position", () => {
    tool.mouseDown(new Vector2(1, 2));
    expect(Object.keys(blueprint.terrainFeatures[0]).sort()).toEqual([
      "id",
      "x",
      "y",
    ]);
  });

  it("selects an existing annotation instead of stacking a second one", () => {
    tool.featureId = "OilWell";
    tool.mouseDown(new Vector2(4, 5));

    // Anywhere inside the 4x2 footprint, not just the anchor cell.
    tool.mouseDown(new Vector2(7, 6));

    expect(blueprint.terrainFeatures).toHaveLength(1);
    expect(terrainService.selected).toBe(blueprint.terrainFeatures[0]);
  });

  // The editor's shared cell convention is floor(x)/ceil(y) (DrawHelpers.
  // getIntegerTile) — annotations must land on the same grid every other tool
  // uses, or a geyser would sit a row off from the building placed beside it.
  it("snaps a sub-tile click to the same cell grid as every other tool", () => {
    tool.mouseDown(new Vector2(4.8, 5.2));
    expect(blueprint.terrainFeatures[0]).toMatchObject({ x: 4, y: 6 });
  });

  it("never touches blueprintItems — annotations are not construction", () => {
    tool.mouseDown(new Vector2(0, 0));
    expect((blueprint as any).blueprintItems).toBeUndefined();
  });

  it("shows the layer when picked, so a placement cannot land invisibly", () => {
    terrainService.visible = false;
    tool.switchTo();
    expect(terrainService.visible).toBe(true);
  });

  // Hiding the layer mid-session must not turn clicks into no-ops either.
  it("reveals a hidden layer when placing, rather than placing invisibly", () => {
    terrainService.visible = false;
    tool.mouseDown(new Vector2(1, 1));

    expect(terrainService.visible).toBe(true);
    expect(blueprint.terrainFeatures).toHaveLength(1);
  });

  it("falls back to a known feature when its id is not in the database", () => {
    tool.featureId = "SomethingRetired";
    tool.switchTo();
    expect(tool.featureId).toBe(CATALOGUE[0].id);
  });

  it("returns to Select on right-click and on cancel", () => {
    tool.rightClick(new Vector2(0, 0));
    expect(parent.changeTool).toHaveBeenCalledWith(ToolType.select);

    expect(tool.handleShortcut(ShortcutAction.interfaceCancel)).toBe(true);
  });

  it("declines shortcuts it does not own so they fall through", () => {
    expect(tool.handleShortcut(ShortcutAction.editUndo)).toBe(false);
  });
});
