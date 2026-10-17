import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniTerrainFeature,
  BniWorldNote,
  BniDigCommand,
  CameraService,
  TerrainFeature,
  Vector2,
} from "../../../../../lib/index";
import { HoverCardService, HoverCardView } from "./hover-card.service";
import { SelectTool } from "../common/tools/select-tool";
import { WorldNoteService } from "./world-note.service";
import { TerrainAnnotationService } from "./terrain-annotation.service";
import { BlueprintService } from "./blueprint-service";
import { ToolService } from "./tool-service";
import { GameStringService } from "./game-string-service";

const CELL = { x: 2, y: 3 };
const RECT = { left: 100, top: 100, width: 32, height: 32 };

function item(id: string, depth: number): any {
  const oniItem = {
    id,
    name: id,
    isElement: false,
    buildableElementsArray: [],
  };
  return {
    id,
    oniItem,
    depth,
    position: new Vector2(CELL.x, CELL.y),
    buildableElements: [{ id: "Copper", name: "Copper" }],
    temperature: 293,
    selected: false,
  };
}

describe("HoverCardService", () => {
  let service: HoverCardService;
  let selectTool: SelectTool;
  let worldNoteService: WorldNoteService;
  let terrainService: TerrainAnnotationService;
  let toolService: { selectTool: SelectTool; digTool: any };
  let views: (HoverCardView | null)[];
  let blueprint: {
    worldNotes: BniWorldNote[];
    terrainFeatures: BniTerrainFeature[];
    digCommands: BniDigCommand[];
    items: any[];
    getBlueprintItemsAt: (position: Vector2) => any[];
  };

  const lastView = () => views[views.length - 1];
  const borders = () => lastView()!.cards.map((card) => card.selected);

  beforeEach(() => {
    Object.defineProperty(CameraService, "cameraService", {
      get: () => ({ resetSinWave: vi.fn(), setOverlayForItem: vi.fn() }),
      configurable: true,
    });
    TerrainFeature.init();
    TerrainFeature.load([]);

    blueprint = {
      worldNotes: [],
      terrainFeatures: [],
      digCommands: [],
      items: [item("Wire", 120), item("Tile", 30)],
      getBlueprintItemsAt: (position) =>
        position.x === CELL.x && position.y === CELL.y ? blueprint.items : [],
    };
    const blueprintService = { blueprint } as unknown as BlueprintService;
    selectTool = new SelectTool(blueprintService);
    worldNoteService = new WorldNoteService(blueprintService);
    terrainService = new TerrainAnnotationService(blueprintService);
    toolService = { selectTool, digTool: { showDigCommands: true } };

    service = new HoverCardService(
      blueprintService,
      toolService as unknown as ToolService,
      worldNoteService,
      terrainService,
      { dict: {} } as unknown as GameStringService,
    );
    views = [];
    service.connect((view) => views.push(view));
  });

  it("lists the cell with no border before any click", () => {
    service.show(CELL, RECT);
    expect(lastView()!.cards.map((card) => card.header)).toEqual([
      "Wire",
      "Tile",
    ]);
    expect(borders()).toEqual([false, false]);
    expect(lastView()!.cellRect).toEqual(RECT);
  });

  it("borders the clicked entry on the click, then moves it as clicks cycle", () => {
    service.show(CELL, RECT);

    // The first click selects the frontmost group and announces it.
    selectTool.leftClick(new Vector2(CELL.x, CELL.y));
    expect(borders()).toEqual([true, false]);

    // A second click on the same cell cycles to the next group. The canvas
    // re-renders on every pointer-up (mouseStopDrag), forced, since the cell
    // and camera have not changed.
    selectTool.leftClick(new Vector2(CELL.x, CELL.y));
    service.show(CELL, RECT, true);
    expect(borders()).toEqual([false, true]);

    selectTool.rightClick(new Vector2(CELL.x, CELL.y));
    expect(borders()).toEqual([false, false]);
  });

  it("borders the selected note", () => {
    const note: BniWorldNote = { x: CELL.x, y: CELL.y, type: 0, title: "Hi" };
    blueprint.worldNotes = [note];
    service.show(CELL, RECT);
    expect(borders()).toEqual([false, false, false]);

    worldNoteService.select(note);
    service.refresh();
    expect(borders()).toEqual([true, false, false]);
  });

  it("never borders a dig", () => {
    blueprint.items = [];
    blueprint.digCommands = [{ x: CELL.x, y: CELL.y }];
    service.show(CELL, RECT);
    expect(lastView()!.cards).toHaveLength(1);
    expect(borders()).toEqual([false]);
  });

  it("skips a re-render for the same cell, unless forced", () => {
    service.show(CELL, RECT);
    service.show(CELL, RECT);
    expect(views).toHaveLength(1);
    service.show(CELL, { ...RECT, left: 120 });
    expect(views).toHaveLength(2);
    service.show(CELL, { ...RECT, left: 120 }, true);
    expect(views).toHaveLength(3);
  });

  it("shows nothing over an empty cell, and hides", () => {
    service.show({ x: 50, y: 50 }, RECT);
    expect(lastView()).toBe(null);

    service.show(CELL, RECT);
    expect(lastView()).not.toBe(null);
    service.hide();
    expect(lastView()).toBe(null);
  });

  it("leaves out the layers the view hides", () => {
    blueprint.digCommands = [{ x: CELL.x, y: CELL.y }];
    toolService.digTool.showDigCommands = false;
    service.show(CELL, RECT);
    expect(lastView()!.cards.map((card) => card.header)).toEqual([
      "Wire",
      "Tile",
    ]);
  });
});
