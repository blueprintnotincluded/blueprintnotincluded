import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniTerrainFeature,
  BniWorldNote,
  BTerrainFeature,
  TerrainFeature,
} from "../../../../../../lib/index";
import { TerrainEditPanelComponent } from "./terrain-edit-panel.component";
import { TerrainAnnotationService } from "../../services/terrain-annotation.service";
import { BlueprintService } from "../../services/blueprint-service";
import { ToolService } from "../../services/tool-service";
import { ToolType } from "../../common/tools/tool";
import { KeybindingService } from "../../services/keybinding.service";

const CATALOGUE: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
    activeTile: { x: 0, y: 1 },
  },
  {
    id: "ForestTree",
    name: "Arbor Tree",
    width: 1,
    height: 1,
    dlcIds: [],
    kind: "plant",
  },
];

describe("TerrainEditPanelComponent", () => {
  let component: TerrainEditPanelComponent;
  let terrainService: TerrainAnnotationService;
  let toolService: { changeTool: ReturnType<typeof vi.fn> };
  let blueprint: {
    terrainFeatures: BniTerrainFeature[];
    worldNotes: BniWorldNote[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    blueprint = {
      terrainFeatures: [],
      worldNotes: [],
      emitBlueprintChanged: vi.fn(),
    };
    terrainService = new TerrainAnnotationService({
      blueprint,
    } as unknown as BlueprintService);
    toolService = { changeTool: vi.fn() };
    component = new TerrainEditPanelComponent(
      terrainService,
      toolService as unknown as ToolService,
      new KeybindingService(),
    );
  });

  function place(feature: BniTerrainFeature): BniTerrainFeature {
    blueprint.terrainFeatures.push(feature);
    terrainService.select(feature);
    return feature;
  }

  it("shows nothing while no feature is selected", () => {
    expect(component.feature).toBe(null);
    expect(component.name).toBe("");
    expect(component.iconUrl).toBe("");
  });

  it("describes the selected feature from the catalogue", () => {
    place({ id: "GeyserGeneric_steam", x: 5, y: 7 });

    expect(component.name).toBe("Cool Steam Vent");
    expect(component.footprintLabel).toBe("2×4");
    expect(component.activeTile).toEqual({ x: 5, y: 8 });
    expect(component.isUnknown).toBe(false);
    expect(component.iconUrl).toContain("GeyserGeneric_steam");
  });

  // A plant erupts nowhere, so the panel names it and labels no active cell.
  it("describes a plant without an eruption cell", () => {
    place({ id: "ForestTree", x: 2, y: 2 });

    expect(component.isPlant).toBe(true);
    expect(component.name).toBe("Arbor Tree");
    expect(component.footprintLabel).toBe("1×1");
    expect(component.activeTile).toBe(null);
    expect(component.isUnknown).toBe(false);
  });

  it("does not call a geyser a plant", () => {
    place({ id: "GeyserGeneric_steam", x: 5, y: 7 });
    expect(component.isPlant).toBe(false);
  });

  // An id the database doesn't know is still shown and still deletable, so a
  // modded feature can never become an immovable ghost.
  it("keeps an unrecognised id selectable and marks it unknown", () => {
    place({ id: "SomeModdedGeyser", x: 1, y: 1 });

    expect(component.isUnknown).toBe(true);
    expect(component.footprintLabel).toBe("1×1");
    expect(component.name).toBe("SomeModdedGeyser");
  });

  it("deletes the selected feature and clears the selection", () => {
    const keep = { id: "GeyserGeneric_steam", x: 20, y: 20 };
    blueprint.terrainFeatures.push(keep);
    place({ id: "GeyserGeneric_steam", x: 5, y: 7 });

    component.deleteFeature();

    expect(blueprint.terrainFeatures).toEqual([keep]);
    expect(terrainService.selected).toBe(null);
    expect(component.feature).toBe(null);
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalledTimes(1);
  });

  it("deleteFeature() is a no-op with nothing selected", () => {
    component.deleteFeature();
    expect(blueprint.emitBlueprintChanged).not.toHaveBeenCalled();
  });

  it("close() clears the selection without switching tools", () => {
    place({ id: "GeyserGeneric_steam", x: 5, y: 7 });

    component.close();

    expect(terrainService.selected).toBe(null);
    expect(toolService.changeTool).not.toHaveBeenCalled();
  });

  it("openTerrainTool() switches to the terrain tool", () => {
    component.openTerrainTool();
    expect(toolService.changeTool).toHaveBeenCalledWith(ToolType.terrain);
  });
});
