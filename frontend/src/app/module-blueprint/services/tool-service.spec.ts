import { ToolService, CanvasRightClick } from "./tool-service";
import { ToolType } from "../common/tools/tool";
import {
  BlueprintHelpers,
  BniWorldNote,
  CameraService,
  Overlay,
  Vector2,
} from "../../../../../lib/index";
import { PlanningTool } from "../common/tools/planning-tool";
import { NotesTool } from "../common/tools/notes-tool";
import { TerrainTool } from "../common/tools/terrain-tool";
import { DigTool } from "../common/tools/dig-tool";
import { ShortcutAction } from "../keybindings/shortcut-actions";
import { BlueprintService } from "./blueprint-service";
import { WorldNoteService } from "./world-note.service";

const makeTool = (toolType: ToolType, toolGroup = 1) => ({
  toolType,
  toolGroup,
  visible: false,
  captureInput: true,
  toggleable: false,
  switchFrom: vi.fn(),
  switchTo: vi.fn(),
  mouseOut: vi.fn(),
  mouseDown: vi.fn(),
  leftClick: vi.fn(),
  rightClick: vi.fn(),
  hover: vi.fn(),
  drag: vi.fn(),
  dragStop: vi.fn(),
  handleShortcut: vi.fn().mockReturnValue(false),
  draw: vi.fn(),
  parent: null as any,
  // SelectTool/BuildTool members ToolService reaches for when wiring the
  // game's "copy building" shortcut.
  selectedItem: null as any,
  selectedItems: [] as any[],
  changeItem: vi.fn(),
});

describe("ToolService", () => {
  let service: ToolService;
  let mockSelect: ReturnType<typeof makeTool>;
  let mockBuild: ReturnType<typeof makeTool>;
  let mockElementReport: any;
  let mockScissors: ReturnType<typeof makeTool>;
  let mockPlanning: ReturnType<typeof makeTool>;
  let mockNotes: ReturnType<typeof makeTool> & {
    pendingElementNote: BniWorldNote;
    mode: "text" | "element";
  };
  let mockTerrain: ReturnType<typeof makeTool>;
  let mockDig: ReturnType<typeof makeTool>;
  let blueprintItemsAt: any[];
  let worldNotes: BniWorldNote[];
  let mockBlueprintService: { blueprint: any };
  let mockWorldNoteService: { selected: BniWorldNote | null };

  beforeEach(() => {
    mockSelect = makeTool(ToolType.select);
    mockBuild = makeTool(ToolType.build);
    mockElementReport = {};
    mockScissors = makeTool(ToolType.scissors);
    mockPlanning = makeTool(ToolType.planning);
    mockNotes = {
      ...makeTool(ToolType.notes),
      pendingElementNote: { x: 0, y: 0, type: 1 },
      mode: "text",
    };
    mockTerrain = makeTool(ToolType.terrain);
    mockDig = makeTool(ToolType.dig);

    blueprintItemsAt = [];
    worldNotes = [];
    mockBlueprintService = {
      blueprint: {
        getBlueprintItemsAt: vi.fn().mockReturnValue(blueprintItemsAt),
        worldNotes,
      },
    };
    mockWorldNoteService = { selected: null };

    service = new ToolService(
      mockSelect as any,
      mockBuild as any,
      mockElementReport,
      mockScissors as any,
      mockPlanning as unknown as PlanningTool,
      mockNotes as unknown as NotesTool,
      mockTerrain as unknown as TerrainTool,
      mockDig as unknown as DigTool,
      mockBlueprintService as unknown as BlueprintService,
      mockWorldNoteService as unknown as WorldNoteService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTool", () => {
    it("returns the tool registered for every ToolType", () => {
      const expected: [ToolType, unknown][] = [
        [ToolType.select, mockSelect],
        [ToolType.build, mockBuild],
        [ToolType.scissors, mockScissors],
        [ToolType.planning, mockPlanning],
        [ToolType.notes, mockNotes],
        [ToolType.terrain, mockTerrain],
        [ToolType.dig, mockDig],
      ];
      for (const [toolType, tool] of expected)
        expect(service.getTool(toolType), ToolType[toolType]).toBe(tool);
    });
  });

  describe("changeTool", () => {
    it("calls switchTo on the newly selected tool", () => {
      service.changeTool(ToolType.build);
      expect(mockBuild.switchTo).toHaveBeenCalled();
    });

    it("makes the new tool visible", () => {
      service.changeTool(ToolType.build);
      expect(mockBuild.visible).toBe(true);
    });

    it("calls switchFrom on visible sibling in same group", () => {
      mockSelect.visible = true;
      service.changeTool(ToolType.build);
      expect(mockSelect.switchFrom).toHaveBeenCalled();
      expect(mockSelect.visible).toBe(false);
    });

    it("does not call switchFrom on non-visible sibling", () => {
      mockSelect.visible = false;
      service.changeTool(ToolType.build);
      expect(mockSelect.switchFrom).not.toHaveBeenCalled();
    });

    it("sets captureInput tool as currentTool", () => {
      service.changeTool(ToolType.build);
      // Verify delegation now goes to buildTool
      const tile = new Vector2(3, 4);
      service.mouseDown(tile);
      expect(mockBuild.mouseDown).toHaveBeenCalledWith(tile, undefined);
    });

    it("toggles tool off when it is already visible and toggleable", () => {
      mockBuild.toggleable = true;
      mockBuild.visible = true;
      service.changeTool(ToolType.build);
      expect(mockBuild.visible).toBe(false);
      expect(mockBuild.switchFrom).toHaveBeenCalled();
    });

    it("notifies observers with the new toolType", () => {
      const observer = { toolChanged: vi.fn() };
      service.subscribeToolChanged(observer);
      service.changeTool(ToolType.build);
      expect(observer.toolChanged).toHaveBeenCalledWith(ToolType.build);
    });
  });

  describe("input delegation to current tool", () => {
    it("delegates mouseDown with the float tile position", () => {
      const tile = new Vector2(1, 2);
      const tileFloat = new Vector2(1.4, 2.6);
      service.mouseDown(tile, tileFloat);
      expect(mockSelect.mouseDown).toHaveBeenCalledWith(tile, tileFloat);
    });

    it.each([
      ["leftClick", [new Vector2(1, 2)]],
      ["rightClick", [new Vector2(1, 2)]],
      ["hover", [new Vector2(5, 6)]],
      ["drag", [new Vector2(0, 0), new Vector2(3, 3)]],
      ["dragStop", []],
      ["mouseOut", []],
    ] as const)("delegates %s", (method, args) => {
      (service as any)[method](...args);
      expect((mockSelect as any)[method]).toHaveBeenCalledWith(...args);
    });

    it("reports a right-click with the tool that took it", () => {
      const seen: CanvasRightClick[] = [];
      const subscription = service.rightClicked.subscribe((click) =>
        seen.push(click),
      );
      service.rightClick(new Vector2(1, 2));
      subscription.unsubscribe();
      expect(seen).toEqual([{ toolType: ToolType.select, dropped: false }]);
    });

    it("reports a right-click under Select as dropping the selection it had", () => {
      // Judged before the tool acts: Select's own right-click is what clears it.
      mockSelect.selectedItems = [{} as any];
      mockSelect.rightClick.mockImplementation(() => {
        mockSelect.selectedItems = [];
      });
      const seen: CanvasRightClick[] = [];
      const subscription = service.rightClicked.subscribe((click) =>
        seen.push(click),
      );
      service.rightClick(new Vector2(1, 2));
      subscription.unsubscribe();
      mockSelect.rightClick.mockReset();
      expect(seen).toEqual([{ toolType: ToolType.select, dropped: true }]);
    });

    it("delegates unclaimed shortcuts to the active tool", () => {
      mockSelect.handleShortcut.mockReturnValue(true);
      expect(service.handleShortcut(ShortcutAction.editDelete)).toBe(true);
      expect(mockSelect.handleShortcut).toHaveBeenCalledWith(
        ShortcutAction.editDelete,
      );
    });
  });

  describe("handleShortcut tool switching", () => {
    it.each([
      ["select", ShortcutAction.toolSelect, () => mockSelect],
      ["planning", ShortcutAction.toolPlanning, () => mockPlanning],
      ["notes", ShortcutAction.toolNotes, () => mockNotes],
      ["terrain", ShortcutAction.toolTerrain, () => mockTerrain],
    ])("switches to the %s tool", (_name, action, tool) => {
      expect(service.handleShortcut(action)).toBe(true);
      expect(tool().visible).toBe(true);
    });

    it("switches to the dig tool", () => {
      expect(service.handleShortcut(ShortcutAction.toolDig)).toBe(true);
      expect(mockDig.visible).toBe(true);
      expect(mockDig.parent).toBe(service);
    });

    it("declines the scissors shortcut while it is unavailable", () => {
      vi.spyOn(CameraService, "cameraService", "get").mockReturnValue({
        overlay: Overlay.Base,
      } as any);
      expect(service.handleShortcut(ShortcutAction.toolScissors)).toBe(false);
      expect(mockScissors.visible).toBe(false);
    });

    it("switches to scissors on a connectable overlay", () => {
      vi.spyOn(CameraService, "cameraService", "get").mockReturnValue({
        overlay: Overlay.Power,
      } as any);
      expect(service.handleShortcut(ShortcutAction.toolScissors)).toBe(true);
      expect(mockScissors.visible).toBe(true);
    });
  });

  // The game's "Copy Building": B switches to the build tool and, when
  // something is selected, loads a copy of it as the item to build.
  describe("changeToBuildToolFromSelection", () => {
    it("switches to the build tool without copying when nothing is selected", () => {
      (mockSelect as any).selectedItem = null;
      service.handleShortcut(ShortcutAction.toolBuild);
      expect(mockBuild.visible).toBe(true);
      expect(mockBuild.changeItem).not.toHaveBeenCalled();
    });

    it("loads a clone of the selected item into the build tool", () => {
      const selected = { id: "Wire" };
      const clone = { id: "Wire clone" };
      (mockSelect as any).selectedItem = selected;
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        clone as any,
      );

      service.handleShortcut(ShortcutAction.toolBuild);

      expect(BlueprintHelpers.cloneBlueprintItem).toHaveBeenCalledWith(
        selected,
      );
      expect(mockBuild.visible).toBe(true);
      expect(mockBuild.changeItem).toHaveBeenCalledWith(clone);
    });

    // With nothing selected, B instead samples whatever is under the cursor.
    it("samples the frontmost item under the cursor when nothing is selected", () => {
      const hovered = { id: "Wire", depth: 5 };
      const clone = { id: "Wire clone" };
      blueprintItemsAt.push(hovered);
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        clone as any,
      );

      service.hover(new Vector2(3, 4));
      service.handleShortcut(ShortcutAction.toolBuild);

      expect(
        mockBlueprintService.blueprint.getBlueprintItemsAt,
      ).toHaveBeenCalledWith(new Vector2(3, 4));
      expect(BlueprintHelpers.cloneBlueprintItem).toHaveBeenCalledWith(hovered);
      expect(mockBuild.visible).toBe(true);
      expect(mockBuild.changeItem).toHaveBeenCalledWith(clone);
    });

    it("picks the highest-depth item when a building and an element cell share a tile", () => {
      const cell = { id: "Element", depth: 17 };
      const building = { id: "Wire", depth: 119 };
      blueprintItemsAt.push(cell, building);
      const clone = {};
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        clone as any,
      );

      service.hover(new Vector2(1, 1));
      service.handleShortcut(ShortcutAction.toolBuild);

      expect(BlueprintHelpers.cloneBlueprintItem).toHaveBeenCalledWith(
        building,
      );
    });

    it("switches to the notes tool with an element note under the cursor as the pending brush", () => {
      const note: BniWorldNote = {
        x: 2,
        y: 2,
        type: 1,
        id: 7,
        mass: 500,
        temp: 300,
      };
      worldNotes.push(note);

      service.hover(new Vector2(2, 2));
      service.handleShortcut(ShortcutAction.toolBuild);

      expect(mockNotes.pendingElementNote).to.include({
        id: 7,
        mass: 500,
        temp: 300,
      });
      expect(mockNotes.mode).toBe("element");
      expect(mockNotes.visible).toBe(true);
      expect(mockBuild.changeItem).not.toHaveBeenCalled();
    });

    it("openNotesToolLike samples an element note and opens the notes tool in text mode for a text note", () => {
      service.openNotesToolLike({
        x: 0,
        y: 0,
        type: 1,
        id: 9,
        mass: 10,
        temp: 280,
      });
      expect(mockNotes.pendingElementNote).to.include({
        id: 9,
        mass: 10,
        temp: 280,
      });
      expect(mockNotes.mode).toBe("element");
      expect(mockNotes.visible).toBe(true);

      service.openNotesToolLike({ x: 0, y: 0, type: 0, title: "hi" });
      expect(mockNotes.mode).toBe("text");
      expect(mockNotes.visible).toBe(true);
    });

    it("prefers a selected world note over the hover tile, mirroring the selected-building rule", () => {
      const selectedNote: BniWorldNote = {
        x: 9,
        y: 9,
        type: 1,
        id: 3,
        mass: 10,
        temp: 280,
      };
      mockWorldNoteService.selected = selectedNote;
      blueprintItemsAt.push({ id: "Wire", depth: 5 });

      service.hover(new Vector2(0, 0));
      service.handleShortcut(ShortcutAction.toolBuild);

      expect(mockNotes.pendingElementNote).to.include({
        id: 3,
        mass: 10,
        temp: 280,
      });
      expect(mockNotes.mode).toBe("element");
    });

    it("declines to sample a text note under the cursor (deferred) and just switches to the build tool", () => {
      const note: BniWorldNote = { x: 5, y: 5, type: 0, title: "hi" };
      worldNotes.push(note);

      service.hover(new Vector2(5, 5));
      service.handleShortcut(ShortcutAction.toolBuild);

      expect(mockBuild.visible).toBe(true);
      expect(mockBuild.changeItem).not.toHaveBeenCalled();
    });
  });
});
