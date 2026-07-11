import { SelectTool } from "./select-tool";
import {
  BlueprintHelpers,
  CameraService,
  Vector2,
} from "../../../../../../lib/index";
import { ToolType } from "./tool";

const makeOniItem = (id: string, isElement = false, isInfo = false) => ({
  id,
  isElement,
  isInfo,
  buildableElementsArray: [],
  zIndex: 0,
  utilityConnections: [],
});

const makeBlueprintItem = (oniItem: any, position = new Vector2(0, 0)) => ({
  oniItem,
  buildableElements: [{ id: "elem1" }],
  depth: 0,
  position,
  selected: false,
  temperature: 293,
});

const makeMockCollection = (selected = false, items: any[] = []) => ({
  selected,
  items,
  oniItem: makeOniItem("test"),
  destroyAll: vi.fn(),
});

describe("SelectTool", () => {
  let tool: SelectTool;
  let mockBlueprintService: any;
  let mockDrawPixi: any;
  let mockCamera: any;

  beforeEach(() => {
    Object.defineProperty(CameraService, "cameraService", {
      get: () => ({ resetSinWave: vi.fn(), setOverlayForItem: vi.fn() }),
      configurable: true,
    });

    mockBlueprintService = {
      blueprint: {
        getBlueprintItemsAt: vi.fn(() => []),
        blueprintItems: [],
        pauseChangeEvents: vi.fn(),
        resumeChangeEvents: vi.fn(),
        destroyBlueprintItem: vi.fn(),
      },
    };
    const dimensionsTextSprite: any = {
      text: "",
      anchor: { set: vi.fn() },
      position: { x: 0, y: 0 },
      visible: false,
    };
    mockDrawPixi = {
      drawTileRectangle: vi.fn(),
      getNewText: vi.fn().mockReturnValue(dimensionsTextSprite),
      pixiApp: { stage: { addChild: vi.fn() } },
    };
    mockCamera = {
      cameraOffset: { x: 0, y: 0 },
      currentZoom: 32,
    };
    tool = new SelectTool(mockBlueprintService as any);
  });

  describe("showTool getter", () => {
    it("returns false when sameItemCollections is empty", () => {
      expect(tool.showTool).toBe(false);
    });

    it("returns true when there is at least one collection", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      expect(tool.showTool).toBe(true);
    });
  });

  describe("subscribeSelectionChanged / emitSelectionChanged", () => {
    it("notifies observer when deselectAll is called", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      tool.deselectAll();
      expect(obs.selectionChanged).toHaveBeenCalled();
    });

    it("notifies multiple observers", () => {
      const obs1 = { selectionChanged: vi.fn() };
      const obs2 = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs1);
      tool.subscribeSelectionChanged(obs2);
      tool.deselectAll();
      expect(obs1.selectionChanged).toHaveBeenCalled();
      expect(obs2.selectionChanged).toHaveBeenCalled();
    });
  });

  describe("deselectAll()", () => {
    it("clears sameItemCollections", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.deselectAll();
      expect(tool.sameItemCollections).toHaveLength(0);
    });

    it("sets selected = false on each collection", () => {
      const col = makeMockCollection(true);
      tool.sameItemCollections = [col] as any;
      tool.deselectAll();
      expect(col.selected).toBe(false);
    });

    it("emits selectionChanged", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      tool.deselectAll();
      expect(obs.selectionChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe("currentMultipleSelectionIndex getter/setter", () => {
    it("returns -1 when no collection is selected", () => {
      tool.sameItemCollections = [
        makeMockCollection(false),
        makeMockCollection(false),
      ] as any;
      expect(tool.currentMultipleSelectionIndex).toBe(-1);
    });

    it("returns the index of the selected collection", () => {
      tool.sameItemCollections = [
        makeMockCollection(false),
        makeMockCollection(true),
      ] as any;
      expect(tool.currentMultipleSelectionIndex).toBe(1);
    });

    it("setter selects the collection at the given index", () => {
      const col0 = makeMockCollection(false);
      const col1 = makeMockCollection(false);
      const col2 = makeMockCollection(false);
      tool.sameItemCollections = [col0, col1, col2] as any;
      tool.currentMultipleSelectionIndex = 1;
      expect(col0.selected).toBe(false);
      expect(col1.selected).toBe(true);
      expect(col2.selected).toBe(false);
    });

    it("setter deselects all when index does not match any", () => {
      const col0 = makeMockCollection(true);
      const col1 = makeMockCollection(false);
      tool.sameItemCollections = [col0, col1] as any;
      tool.currentMultipleSelectionIndex = 99;
      expect(col0.selected).toBe(false);
      expect(col1.selected).toBe(false);
    });
  });

  describe("itemGroupeNext()", () => {
    it("advances selection to the next collection", () => {
      tool.sameItemCollections = [
        makeMockCollection(true),
        makeMockCollection(false),
        makeMockCollection(false),
      ] as any;
      tool.itemGroupeNext();
      expect(tool.currentMultipleSelectionIndex).toBe(1);
    });

    it("wraps from last to first", () => {
      tool.sameItemCollections = [
        makeMockCollection(false),
        makeMockCollection(true),
      ] as any;
      tool.itemGroupeNext();
      expect(tool.currentMultipleSelectionIndex).toBe(0);
    });
  });

  describe("itemGroupePrevious()", () => {
    it("moves selection to the previous collection", () => {
      tool.sameItemCollections = [
        makeMockCollection(false),
        makeMockCollection(true),
        makeMockCollection(false),
      ] as any;
      tool.itemGroupePrevious();
      expect(tool.currentMultipleSelectionIndex).toBe(0);
    });

    it("wraps from first to last", () => {
      tool.sameItemCollections = [
        makeMockCollection(true),
        makeMockCollection(false),
      ] as any;
      tool.itemGroupePrevious();
      expect(tool.currentMultipleSelectionIndex).toBe(1);
    });

    it("treats -1 (nothing selected) as if index were 1, so previous is 0", () => {
      tool.sameItemCollections = [
        makeMockCollection(false),
        makeMockCollection(false),
      ] as any;
      // currentIndex == -1 → corrected to 1 → 1-1 = 0
      tool.itemGroupePrevious();
      expect(tool.currentMultipleSelectionIndex).toBe(0);
    });
  });

  describe("switchFrom() / switchTo()", () => {
    it("switchFrom clears sameItemCollections", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.switchFrom();
      expect(tool.sameItemCollections).toHaveLength(0);
    });

    it("switchTo clears sameItemCollections", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.switchTo();
      expect(tool.sameItemCollections).toHaveLength(0);
    });
  });

  describe("rightClick()", () => {
    it("calls deselectAll", () => {
      tool.sameItemCollections = [makeMockCollection(true)] as any;
      tool.rightClick(new Vector2(0, 0));
      expect(tool.sameItemCollections).toHaveLength(0);
    });
  });

  describe("leftClick()", () => {
    it("calls selectFromBox when nothing is selected", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      tool.leftClick(new Vector2(2, 3));
      expect(obs.selectionChanged).toHaveBeenCalled();
    });

    it("calls selectFromBox when selected item is not in next group at the tile", () => {
      const col = makeMockCollection(true, [{ position: new Vector2(5, 5) }]);
      tool.sameItemCollections = [col] as any;
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      // click at tile (0,0) — not the position of col's item
      tool.leftClick(new Vector2(0, 0));
      expect(obs.selectionChanged).toHaveBeenCalled();
    });

    it("cycles to next group when tile matches an item in it", () => {
      const itemPos = new Vector2(3, 3);
      const col0 = makeMockCollection(true, [{ position: itemPos }]);
      const col1 = makeMockCollection(false, [{ position: itemPos }]);
      tool.sameItemCollections = [col0, col1] as any;
      // next_group = (0+1)%2 = 1; col1.items[0].position.equals(tile) → true
      tool.leftClick(itemPos);
      expect(tool.currentMultipleSelectionIndex).toBe(1);
    });
  });

  describe("buildingsDestroy()", () => {
    it("removes the given collection from sameItemCollections", () => {
      const col = makeMockCollection(true, [{}]);
      tool.sameItemCollections = [col] as any;
      tool.buildingsDestroy(col as any);
      expect(tool.sameItemCollections).not.toContain(col);
    });

    it("calls destroyBlueprintItem for each item in the collection", () => {
      const item1 = {};
      const item2 = {};
      const col = makeMockCollection(true, [item1, item2]);
      tool.sameItemCollections = [col] as any;
      tool.buildingsDestroy(col as any);
      expect(
        mockBlueprintService.blueprint.destroyBlueprintItem
      ).toHaveBeenCalledWith(item1);
      expect(
        mockBlueprintService.blueprint.destroyBlueprintItem
      ).toHaveBeenCalledWith(item2);
    });

    it("emits selectionChanged after removal", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      const col = makeMockCollection(true, []);
      tool.sameItemCollections = [col] as any;
      obs.selectionChanged.mockClear();
      tool.buildingsDestroy(col as any);
      expect(obs.selectionChanged).toHaveBeenCalled();
    });
  });

  describe("destroyAll()", () => {
    it("calls destroyAll on each collection", () => {
      const col1 = makeMockCollection();
      const col2 = makeMockCollection();
      tool.sameItemCollections = [col1, col2] as any;
      tool.destroyAll();
      expect(col1.destroyAll).toHaveBeenCalled();
      expect(col2.destroyAll).toHaveBeenCalled();
    });

    it("clears sameItemCollections afterwards", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.destroyAll();
      expect(tool.sameItemCollections).toHaveLength(0);
    });
  });

  describe("keyDown()", () => {
    it("destroys the currently selected collection on Delete", () => {
      const item = {};
      const col = makeMockCollection(true, [item]);
      tool.sameItemCollections = [col] as any;
      tool.keyDown("Delete");
      expect(
        mockBlueprintService.blueprint.destroyBlueprintItem
      ).toHaveBeenCalledWith(item);
    });

    it("does nothing on Delete when nothing is selected", () => {
      tool.sameItemCollections = [makeMockCollection(false)] as any;
      tool.keyDown("Delete");
      expect(
        mockBlueprintService.blueprint.destroyBlueprintItem
      ).not.toHaveBeenCalled();
    });

    it("switches to build tool on 'b' key", () => {
      tool.parent = {
        changeTool: vi.fn(),
        buildTool: { changeItem: vi.fn() },
      } as any;
      tool.keyDown("b");
      expect(tool.parent.changeTool).toHaveBeenCalledWith(ToolType.build);
    });

    it("ignores 'b' key when an INPUT element is focused", () => {
      tool.parent = {
        changeTool: vi.fn(),
        buildTool: { changeItem: vi.fn() },
      } as any;
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      tool.keyDown("b");
      expect(tool.parent.changeTool).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("ignores 'b' key when a TEXTAREA element is focused", () => {
      tool.parent = {
        changeTool: vi.fn(),
        buildTool: { changeItem: vi.fn() },
      } as any;
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();
      tool.keyDown("b");
      expect(tool.parent.changeTool).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it("ignores unrecognised key codes", () => {
      // should not throw
      expect(() => tool.keyDown("Escape")).not.toThrow();
    });
  });

  describe("selectFromBox()", () => {
    it("clears existing collections before selecting", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.selectFromBox(new Vector2(0, 0), new Vector2(0, 0));
      // blueprint returns no items, so result is empty
      expect(tool.sameItemCollections).toHaveLength(0);
    });

    it("emits selectionChanged", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      obs.selectionChanged.mockClear();
      tool.selectFromBox(new Vector2(0, 0), new Vector2(1, 1));
      expect(obs.selectionChanged).toHaveBeenCalled();
    });

    it("iterates all tiles in the bounding box", () => {
      tool.selectFromBox(new Vector2(1, 3), new Vector2(3, 1));
      // 3x3 = 9 tiles queried
      expect(
        mockBlueprintService.blueprint.getBlueprintItemsAt
      ).toHaveBeenCalledTimes(9);
    });
  });

  describe("selectAll()", () => {
    it("clears previous collections", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      mockBlueprintService.blueprint.blueprintItems = [];
      tool.selectAll({} as any);
      expect(tool.sameItemCollections).toHaveLength(0);
    });

    it("collects items matching the given oniItem", () => {
      const oniItem = makeOniItem("Wire");
      const item1 = makeBlueprintItem(oniItem);
      const item2 = makeBlueprintItem(makeOniItem("Tile"));
      mockBlueprintService.blueprint.blueprintItems = [item1, item2];
      tool.selectAll(oniItem as any);
      // one SameItemCollection for "Wire"
      expect(tool.sameItemCollections).toHaveLength(1);
    });

    it("emits selectionChanged", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      obs.selectionChanged.mockClear();
      mockBlueprintService.blueprint.blueprintItems = [];
      tool.selectAll({} as any);
      expect(obs.selectionChanged).toHaveBeenCalled();
    });
  });

  describe("selectThis()", () => {
    it("adds only the specified item to the selection", () => {
      const oniItem = makeOniItem("Wire");
      const target = makeBlueprintItem(oniItem);
      const other = makeBlueprintItem(oniItem);
      mockBlueprintService.blueprint.blueprintItems = [target, other];
      tool.selectThis(target as any);
      expect(tool.sameItemCollections).toHaveLength(1);
      expect(tool.sameItemCollections[0].items[0]).toBe(target);
    });
  });

  describe("selectEveryInfo()", () => {
    it("collects only items whose oniItem.isInfo is true", () => {
      const infoItem = makeOniItem("Info", false, true);
      const normalItem = makeOniItem("Wire", false, false);
      const item1 = makeBlueprintItem(infoItem);
      const item2 = makeBlueprintItem(normalItem);
      mockBlueprintService.blueprint.blueprintItems = [item1, item2];
      tool.selectEveryInfo();
      expect(tool.sameItemCollections).toHaveLength(1);
    });
  });

  // ── Existing draw/drag/dragStop tests (preserved) ──────────────────────────

  describe("draw()", () => {
    it("should not draw when no drag is active", () => {
      tool.draw(mockDrawPixi, mockCamera);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });

    it("should draw selection rectangle while dragging, snapped to whole tiles", () => {
      tool.drag(new Vector2(1, 5), new Vector2(4, 2));
      tool.draw(mockDrawPixi, mockCamera);
      expect(mockDrawPixi.drawTileRectangle).toHaveBeenCalledTimes(1);
      const args = mockDrawPixi.drawTileRectangle.mock.calls.at(-1);
      const [
        camera,
        topLeft,
        bottomRight,
        frontGraphics,
        borderWidth,
        fillColor,
        borderColor,
        fillAlpha,
        borderAlpha,
      ] = args;
      expect(camera).toBe(mockCamera);
      // Bounding box covers the full extent of the whole tiles selectFromBox()
      // will operate on, not just the raw drag endpoints.
      expect(topLeft.x).toBe(1);
      expect(topLeft.y).toBe(5);
      expect(bottomRight.x).toBe(5);
      expect(bottomRight.y).toBe(1);
      expect(frontGraphics).toBe(true); // must be true so it renders above blueprint tiles
      expect(borderWidth).toBe(2);
      expect(fillColor).toBe(0x4cff00); // lime green fill
      expect(borderColor).toBe(0x2d9600); // dark green border
      expect(fillAlpha).toBe(0.25);
      expect(borderAlpha).toBe(0.8);
    });

    it("should normalise coordinates when drag goes top-right to bottom-left", () => {
      // User drags from (5,1) to (1,5): beginSelection gets the larger coords
      tool.drag(new Vector2(5, 1), new Vector2(1, 5));
      tool.draw(mockDrawPixi, mockCamera);
      const [, topLeft, bottomRight] =
        mockDrawPixi.drawTileRectangle.mock.calls.at(-1);
      expect(topLeft.x).toBeLessThanOrEqual(bottomRight.x);
      expect(topLeft.y).toBeGreaterThanOrEqual(bottomRight.y);
    });

    it("should not draw after dragStop clears the selection", () => {
      tool.drag(new Vector2(0, 5), new Vector2(3, 2));
      tool.dragStop();
      tool.draw(mockDrawPixi, mockCamera);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });
  });

  describe("draw() dimensions label", () => {
    it("shows 'width x height' and area centered in the selection box", () => {
      // Snaps to a 9 (wide) x 4 (tall) box == 36 tiles.
      tool.drag(new Vector2(0, 4), new Vector2(8, 1));
      tool.draw(mockDrawPixi, mockCamera);

      expect(mockDrawPixi.getNewText).toHaveBeenCalledTimes(1);
      const label = mockDrawPixi.getNewText.mock.results[0].value;
      expect(label.text).toBe("9 x 4\n36 tiles");
      // Center of the box in world space, converted to screen space.
      expect(label.position.x).toBe(144);
      expect(label.position.y).toBe(-64);
      expect(label.visible).toBe(true);
    });

    it("colours the label to match the selection border", () => {
      tool.drag(new Vector2(0, 0), new Vector2(1, 1));
      tool.draw(mockDrawPixi, mockCamera);

      const style = mockDrawPixi.getNewText.mock.calls[0][1];
      expect(style.fill).toBe("#2d9600");
    });

    it("reuses the same text sprite across draw calls instead of recreating it", () => {
      tool.drag(new Vector2(0, 0), new Vector2(2, 2));
      tool.draw(mockDrawPixi, mockCamera);
      tool.draw(mockDrawPixi, mockCamera);

      expect(mockDrawPixi.getNewText).toHaveBeenCalledTimes(1);
    });

    it("hides the label once dragStop clears the selection", () => {
      tool.drag(new Vector2(0, 0), new Vector2(2, 2));
      tool.draw(mockDrawPixi, mockCamera);
      const label = mockDrawPixi.getNewText.mock.results[0].value;
      expect(label.visible).toBe(true);

      tool.dragStop();
      tool.draw(mockDrawPixi, mockCamera);
      expect(label.visible).toBe(false);
    });

    it("hides the label when switching away from the tool mid-drag", () => {
      tool.drag(new Vector2(0, 0), new Vector2(2, 2));
      tool.draw(mockDrawPixi, mockCamera);
      const label = mockDrawPixi.getNewText.mock.results[0].value;

      tool.switchFrom();
      expect(label.visible).toBe(false);
    });
  });

  describe("drag()", () => {
    it("should set beginSelection from the first valid tileStart", () => {
      const start = new Vector2(2, 3);
      tool.drag(start, new Vector2(4, 1));
      expect(tool.beginSelection).toEqual(start);
    });

    it("should update endSelection on every drag event", () => {
      tool.drag(new Vector2(0, 0), new Vector2(1, 1));
      tool.drag(new Vector2(1, 1), new Vector2(5, 5));
      expect(tool.endSelection).toEqual(new Vector2(5, 5));
    });

    it("should keep the original beginSelection across multiple drag events", () => {
      const start = new Vector2(1, 4);
      tool.drag(start, new Vector2(2, 3));
      tool.drag(new Vector2(2, 3), new Vector2(3, 2));
      expect(tool.beginSelection).toEqual(start);
    });
  });

  describe("dragStop()", () => {
    it("should clear beginSelection", () => {
      tool.drag(new Vector2(0, 0), new Vector2(2, 2));
      tool.dragStop();
      expect(tool.beginSelection).toBeNull();
    });

    it("does nothing when beginSelection is already null", () => {
      tool.beginSelection = null;
      expect(() => tool.dragStop()).not.toThrow();
      expect(tool.beginSelection).toBeNull();
    });
  });

  describe("reset()", () => {
    it("clears sameItemCollections to empty", () => {
      tool.sameItemCollections = [makeMockCollection()] as any;
      tool.reset();
      expect(tool.sameItemCollections).toHaveLength(0);
    });
  });

  describe("mouseOut() / mouseDown() / hover()", () => {
    it("mouseOut does not throw", () => {
      expect(() => tool.mouseOut()).not.toThrow();
    });

    it("mouseDown does not throw", () => {
      expect(() => tool.mouseDown(new Vector2(0, 0))).not.toThrow();
    });

    it("hover does not throw", () => {
      expect(() => tool.hover(new Vector2(0, 0))).not.toThrow();
    });
  });

  describe("selectAllLike()", () => {
    it("selects all items sharing the same oniItem (non-element)", () => {
      const oniItem = makeOniItem("Wire", false, false);
      const item1 = makeBlueprintItem(oniItem);
      const item2 = makeBlueprintItem(oniItem);
      const item3 = makeBlueprintItem(makeOniItem("Tile"));
      mockBlueprintService.blueprint.blueprintItems = [item1, item2, item3];
      tool.selectAllLike(item1 as any);
      expect(tool.sameItemCollections).toHaveLength(1);
      expect(tool.sameItemCollections[0].items).toHaveLength(2);
    });

    it("filters by oniItem AND buildableElement[0] for element items", () => {
      const oniItem = makeOniItem("Element", true, false);
      const elem1 = { id: "Water" };
      const elem2 = { id: "Oxygen" };
      const item1 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [elem1],
      };
      const item2 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [elem2],
      };
      const item3 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [elem1],
      };
      mockBlueprintService.blueprint.blueprintItems = [item1, item2, item3];
      tool.selectAllLike(item1 as any);
      expect(tool.sameItemCollections[0].items).toHaveLength(2);
    });

    it("emits selectionChanged", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      mockBlueprintService.blueprint.blueprintItems = [];
      obs.selectionChanged.mockClear();
      tool.selectAllLike({
        oniItem: makeOniItem("Wire"),
        buildableElements: [],
      } as any);
      expect(obs.selectionChanged).toHaveBeenCalled();
    });
  });

  describe("selectEveryElement()", () => {
    it("selects items that contain the given BuildableElement", () => {
      const oniItem = makeOniItem("Wire");
      const target = { id: "elem-target" };
      const item1 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [target],
      };
      const item2 = { ...makeBlueprintItem(oniItem), buildableElements: [] };
      mockBlueprintService.blueprint.blueprintItems = [item1, item2];
      tool.selectEveryElement(target as any);
      expect(tool.sameItemCollections).toHaveLength(1);
      expect(tool.sameItemCollections[0].items[0]).toBe(item1);
    });

    it("emits selectionChanged", () => {
      const obs = { selectionChanged: vi.fn() };
      tool.subscribeSelectionChanged(obs);
      mockBlueprintService.blueprint.blueprintItems = [];
      obs.selectionChanged.mockClear();
      tool.selectEveryElement({ id: "x" } as any);
      expect(obs.selectionChanged).toHaveBeenCalled();
    });
  });

  describe("addToCollection() element grouping", () => {
    it("groups element items with the same buildableElement[0] id into one collection", () => {
      const oniItem = makeOniItem("Element", true, false);
      const elem = { id: "Water" };
      const item1 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [elem],
      };
      const item2 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [elem],
      };
      mockBlueprintService.blueprint.blueprintItems = [item1, item2];
      tool.selectAllLike(item1 as any);
      expect(tool.sameItemCollections).toHaveLength(1);
      expect(tool.sameItemCollections[0].items).toHaveLength(2);
    });

    it("separates element items with different buildableElement[0] ids", () => {
      const oniItem = makeOniItem("Element", true, false);
      const item1 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [{ id: "Water" }],
      };
      const item2 = {
        ...makeBlueprintItem(oniItem),
        buildableElements: [{ id: "Oxygen" }],
      };
      mockBlueprintService.blueprint.blueprintItems = [item1, item2];
      tool.selectAllLike(item1 as any);
      expect(tool.sameItemCollections).toHaveLength(1);
      expect(tool.sameItemCollections[0].items).toHaveLength(1);
    });
  });

  describe("keyDown() b key with item selected", () => {
    it("calls changeTool(build) and changeItem with the cloned item", () => {
      const mockClonedItem = { id: "Wire" };
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        mockClonedItem as any
      );

      const oniItem = makeOniItem("Wire");
      const item = makeBlueprintItem(oniItem);
      const col = { ...makeMockCollection(true, [item]), oniItem };
      (col as any).items = [item];
      tool.sameItemCollections = [col] as any;
      tool.parent = {
        changeTool: vi.fn(),
        buildTool: { changeItem: vi.fn() },
      } as any;

      tool.keyDown("b");

      expect(tool.parent.changeTool).toHaveBeenCalledWith(ToolType.build);
      expect(tool.parent.buildTool.changeItem).toHaveBeenCalledWith(
        mockClonedItem
      );
      vi.restoreAllMocks();
    });
  });
});
