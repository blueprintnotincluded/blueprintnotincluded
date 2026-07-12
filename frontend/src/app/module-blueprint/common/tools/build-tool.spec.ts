import { BuildTool } from "./build-tool";
import {
  Vector2,
  CameraService,
  BlueprintHelpers,
  BuildLocationRule,
} from "../../../../../../lib/index";
import { ToolType } from "./tool";

const makeOniItem = (overrides: any = {}) => ({
  buildLocationRule: BuildLocationRule.Anywhere,
  objectLayer: 1,
  utilityConnections: [],
  isWire: false,
  name: "TestItem",
  overlay: 0,
  ...overrides,
});

const makeTemplateItem = (overrides: any = {}) => ({
  buildCandidateResult: { canBuild: true, cantBuildReason: "" },
  tileIndexes: [0],
  oniItem: makeOniItem(),
  position: new Vector2(0, 0),
  rotation: 0,
  scale: new Vector2(1, 1),
  isBuildCandidate: false,
  alpha: 0,
  destroy: vi.fn(),
  setInvisible: vi.fn(),
  cleanUp: vi.fn(),
  prepareBoundingBox: vi.fn(),
  updateTileables: vi.fn(),
  sortChildren: vi.fn(),
  nextOrientation: vi.fn(),
  drawPixi: vi.fn(),
  connections: 0,
  ...overrides,
});

describe("BuildTool", () => {
  let tool: BuildTool;
  let mockBlueprintService: any;
  let mockBlueprint: any;
  let mockAppRef: any;
  let mockCameraService: any;
  let templateItem: any;

  beforeEach(() => {
    mockBlueprint = {
      getBlueprintItemsAtIndex: vi.fn().mockReturnValue([]),
      getUtilityConnectionsAtIndex: vi.fn().mockReturnValue([]),
      getBlueprintItemsAt: vi.fn().mockReturnValue([]),
      addBlueprintItem: vi.fn(),
      refreshOverlayInfo: vi.fn(),
      emitBlueprintChanged: vi.fn(),
    };
    mockBlueprintService = { blueprint: mockBlueprint };
    mockAppRef = { tick: vi.fn() };
    mockCameraService = { setOverlayForItem: vi.fn() };

    vi.spyOn(CameraService, "cameraService", "get").mockReturnValue(
      mockCameraService as any,
    );

    tool = new BuildTool(mockBlueprintService as any, mockAppRef as any);
    templateItem = makeTemplateItem();
    tool.templateItemToBuild = templateItem;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("static properties", () => {
    it("has correct tool type", () => {
      expect(tool.toolType).toBe(ToolType.build);
    });

    it("is not toggleable", () => {
      expect(tool.toggleable).toBe(false);
    });

    it("captures input", () => {
      expect(tool.captureInput).toBe(true);
    });

    it("is not visible", () => {
      expect(tool.visible).toBe(false);
    });

    it("belongs to toolGroup 1", () => {
      expect(tool.toolGroup).toBe(1);
    });
  });

  describe("subscribeBuildItemChanged", () => {
    it("registers an observer", () => {
      const observer = { itemChanged: vi.fn() };
      tool.subscribeBuildItemChanged(observer);
      tool.changeItem(templateItem);
      expect(observer.itemChanged).toHaveBeenCalledWith(templateItem);
    });

    it("notifies all registered observers", () => {
      const obs1 = { itemChanged: vi.fn() };
      const obs2 = { itemChanged: vi.fn() };
      tool.subscribeBuildItemChanged(obs1);
      tool.subscribeBuildItemChanged(obs2);
      tool.changeItem(templateItem);
      expect(obs1.itemChanged).toHaveBeenCalled();
      expect(obs2.itemChanged).toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("calls destroy on templateItemToBuild and nulls it", () => {
      tool.destroy();
      expect(templateItem.destroy).toHaveBeenCalled();
      expect(tool.templateItemToBuild).toBeNull();
    });

    it("does nothing when templateItemToBuild is null", () => {
      tool.templateItemToBuild = null!;
      expect(() => tool.destroy()).not.toThrow();
    });
  });

  describe("changeItem", () => {
    it("destroys the previous template item", () => {
      const oldItem = templateItem;
      const newItem = makeTemplateItem();
      tool.changeItem(newItem);
      expect(oldItem.destroy).toHaveBeenCalled();
    });

    it("sets the new item as templateItemToBuild", () => {
      const newItem = makeTemplateItem();
      tool.changeItem(newItem);
      expect(tool.templateItemToBuild).toBe(newItem);
    });

    it("sets isBuildCandidate to true on new item", () => {
      const newItem = makeTemplateItem({ isBuildCandidate: false });
      tool.changeItem(newItem);
      expect(newItem.isBuildCandidate).toBe(true);
    });

    it("sets alpha to 1 on new item", () => {
      const newItem = makeTemplateItem({ alpha: 0 });
      tool.changeItem(newItem);
      expect(newItem.alpha).toBe(1);
    });

    it("calls setInvisible, cleanUp, prepareBoundingBox, updateTileables on new item", () => {
      const newItem = makeTemplateItem();
      tool.changeItem(newItem);
      expect(newItem.setInvisible).toHaveBeenCalled();
      expect(newItem.cleanUp).toHaveBeenCalled();
      expect(newItem.prepareBoundingBox).toHaveBeenCalled();
      expect(newItem.updateTileables).toHaveBeenCalledWith(mockBlueprint);
    });

    it("calls CameraService.setOverlayForItem with item's oniItem", () => {
      const newItem = makeTemplateItem();
      tool.changeItem(newItem);
      expect(mockCameraService.setOverlayForItem).toHaveBeenCalledWith(
        newItem.oniItem,
      );
    });
  });

  describe("switchFrom", () => {
    it("destroys the template item", () => {
      tool.switchFrom();
      expect(templateItem.destroy).toHaveBeenCalled();
    });
  });

  describe("switchTo", () => {
    it("is a no-op that does not throw", () => {
      expect(() => tool.switchTo()).not.toThrow();
    });
  });

  describe("dragStop", () => {
    it("is a no-op that does not throw", () => {
      expect(() => tool.dragStop()).not.toThrow();
    });
  });

  describe("mouseOut", () => {
    it("calls setInvisible on the template item", () => {
      tool.mouseOut();
      expect(templateItem.setInvisible).toHaveBeenCalled();
    });

    it("does nothing when templateItemToBuild is null", () => {
      tool.templateItemToBuild = null!;
      expect(() => tool.mouseOut()).not.toThrow();
    });
  });

  describe("rightClick", () => {
    it("changes tool to select", () => {
      const mockParent = { changeTool: vi.fn() };
      tool.parent = mockParent as any;
      tool.rightClick(new Vector2(0, 0));
      expect(mockParent.changeTool).toHaveBeenCalledWith(ToolType.select);
    });
  });

  describe("leftClick", () => {
    it("sets position and triggers build", () => {
      const addSpy = mockBlueprint.addBlueprintItem;
      const cloned = makeTemplateItem();
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        cloned as any,
      );
      const tile = new Vector2(3, 4);
      tool.leftClick(tile);
      expect(tool.templateItemToBuild.position).toBe(tile);
      expect(addSpy).toHaveBeenCalledWith(cloned);
    });
  });

  describe("mouseDown", () => {
    it("sets position and triggers build", () => {
      const cloned = makeTemplateItem();
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        cloned as any,
      );
      const tile = new Vector2(5, 6);
      tool.mouseDown(tile);
      expect(tool.templateItemToBuild.position).toBe(tile);
      expect(mockBlueprint.addBlueprintItem).toHaveBeenCalledWith(cloned);
    });
  });

  describe("build", () => {
    it("skips when canBuild is false", () => {
      templateItem.buildCandidateResult.canBuild = false;
      tool.build();
      expect(mockBlueprint.addBlueprintItem).not.toHaveBeenCalled();
    });

    it("clones item, adds to blueprint, and refreshes overlay when canBuild", () => {
      const cloned = makeTemplateItem();
      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        cloned as any,
      );
      tool.build();
      expect(BlueprintHelpers.cloneBlueprintItem).toHaveBeenCalledWith(
        templateItem,
        false,
        true,
      );
      expect(cloned.prepareBoundingBox).toHaveBeenCalled();
      expect(cloned.updateTileables).toHaveBeenCalledWith(mockBlueprint);
      expect(mockBlueprint.addBlueprintItem).toHaveBeenCalledWith(cloned);
      expect(mockBlueprint.refreshOverlayInfo).toHaveBeenCalled();
    });
  });

  describe("hover", () => {
    it("sets position, calls prepareBoundingBox, sortChildren, and updates build candidate", () => {
      const tile = new Vector2(2, 3);
      tool.hover(tile);
      expect(tool.templateItemToBuild.position.x).toBe(2);
      expect(tool.templateItemToBuild.position.y).toBe(3);
      expect(templateItem.prepareBoundingBox).toHaveBeenCalled();
      expect(templateItem.sortChildren).toHaveBeenCalled();
    });
  });

  describe("keyDown", () => {
    it("calls nextOrientation on 'o' key", () => {
      tool.keyDown("o");
      expect(templateItem.nextOrientation).toHaveBeenCalled();
    });

    it("ignores other keys", () => {
      tool.keyDown("x");
      expect(templateItem.nextOrientation).not.toHaveBeenCalled();
    });

    it("does nothing when templateItemToBuild is null and key is 'o'", () => {
      tool.templateItemToBuild = null!;
      expect(() => tool.keyDown("o")).not.toThrow();
    });
  });

  describe("draw", () => {
    it("calls drawPixi on the template item", () => {
      const mockDrawPixi = {} as any;
      const mockCamera = {} as any;
      tool.draw(mockDrawPixi, mockCamera);
      expect(templateItem.drawPixi).toHaveBeenCalledWith(
        mockCamera,
        mockDrawPixi,
      );
    });
  });

  describe("drag", () => {
    it("does nothing when tileStart is null", () => {
      const spy = vi.spyOn(tool, "dragStepByStep");
      tool.drag(null as any, new Vector2(1, 2));
      expect(spy).not.toHaveBeenCalled();
    });

    it("does nothing when tileStop is null", () => {
      const spy = vi.spyOn(tool, "dragStepByStep");
      tool.drag(new Vector2(1, 2), null as any);
      expect(spy).not.toHaveBeenCalled();
    });

    it("does nothing when start and stop map to the same integer tile", () => {
      const spy = vi.spyOn(tool, "dragStepByStep");
      // floor(1.2)=1, ceil(1.8)=2 — same for both
      tool.drag(new Vector2(1.2, 1.8), new Vector2(1.5, 1.3));
      expect(spy).not.toHaveBeenCalled();
    });

    it("calls dragStepByStep when tiles differ", () => {
      const spy = vi.spyOn(tool, "dragStepByStep").mockImplementation(() => {});
      tool.drag(new Vector2(1.2, 1.8), new Vector2(2.5, 1.3));
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("updateBuildCandidateResult (via hover)", () => {
    it("sets canBuild true when no items share the object layer", () => {
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([]);
      templateItem.buildCandidateResult.canBuild = false;
      templateItem.buildCandidateResult.cantBuildReason = "old reason";
      tool.hover(new Vector2(0, 0));
      expect(templateItem.buildCandidateResult.canBuild).toBe(true);
      expect(templateItem.buildCandidateResult.cantBuildReason).toBe("");
    });

    it("sets canBuild false when a tile contains an item on the same object layer", () => {
      const blocker = { oniItem: { objectLayer: 1, name: "Blocker" } };
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([blocker]);
      templateItem.tileIndexes = [42];
      templateItem.oniItem.objectLayer = 1;
      tool.hover(new Vector2(0, 0));
      expect(templateItem.buildCandidateResult.canBuild).toBe(false);
    });

    it("does not block when blocker is on a different object layer", () => {
      const blocker = { oniItem: { objectLayer: 2, name: "Other" } };
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([blocker]);
      templateItem.oniItem.objectLayer = 1;
      tool.hover(new Vector2(0, 0));
      expect(templateItem.buildCandidateResult.canBuild).toBe(true);
    });

    it("does not block bridges based on tile object layer", () => {
      const blocker = { oniItem: { objectLayer: 1, name: "Blocker" } };
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([blocker]);
      templateItem.oniItem.buildLocationRule = BuildLocationRule.Conduit;
      templateItem.oniItem.objectLayer = 1;
      tool.hover(new Vector2(0, 0));
      expect(templateItem.buildCandidateResult.canBuild).toBe(true);
    });

    it("treats the conductive pipe bridge (NoLiquidConduitAtOrigin) as a bridge", () => {
      const blocker = { oniItem: { objectLayer: 19, name: "Liquid Bridge" } };
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([blocker]);
      templateItem.oniItem.buildLocationRule =
        BuildLocationRule.NoLiquidConduitAtOrigin;
      templateItem.oniItem.objectLayer = 19;
      tool.hover(new Vector2(0, 0));
      expect(templateItem.buildCandidateResult.canBuild).toBe(true);
    });

    it("calls appRef.tick when canBuild state changes", () => {
      templateItem.buildCandidateResult.canBuild = true;
      const blocker = { oniItem: { objectLayer: 1, name: "Blocker" } };
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([blocker]);
      templateItem.oniItem.objectLayer = 1;
      tool.hover(new Vector2(0, 0));
      expect(mockAppRef.tick).toHaveBeenCalled();
    });

    it("does not call appRef.tick when state is unchanged", () => {
      templateItem.buildCandidateResult.canBuild = true;
      mockBlueprint.getBlueprintItemsAtIndex.mockReturnValue([]);
      tool.hover(new Vector2(0, 0));
      expect(mockAppRef.tick).not.toHaveBeenCalled();
    });
  });

  describe("connectAToB bitmask (via buildAndConnect)", () => {
    let wireItemStart: any;
    let wireItemStop: any;

    beforeEach(() => {
      templateItem.oniItem.isWire = true;
      templateItem.oniItem.objectLayer = 2;

      wireItemStart = {
        oniItem: { objectLayer: 2 },
        connections: 0,
        updateTileables: vi.fn(),
      };
      wireItemStop = {
        oniItem: { objectLayer: 2 },
        connections: 0,
        updateTileables: vi.fn(),
      };

      vi.spyOn(BlueprintHelpers, "cloneBlueprintItem").mockReturnValue(
        makeTemplateItem() as any,
      );
    });

    it("connects a right-neighbor: bitMask 2 on start, 1 on stop", () => {
      const start = new Vector2(1, 0);
      const stop = new Vector2(2, 0);
      wireItemStart.position = new Vector2(1, 0);
      wireItemStop.position = new Vector2(2, 0);

      mockBlueprint.getBlueprintItemsAt
        .mockReturnValueOnce([wireItemStart]) // tileStart items
        .mockReturnValueOnce([wireItemStop]); // tileStop items

      tool.buildAndConnect(start, stop);

      // connectAToB(start, stop): start.x(1) == stop.x(2)-1 → bitMask=2
      expect(wireItemStart.connections & 2).toBe(2);
      // connectAToB(stop, start): stop.x(2) == start.x(1)+1 → bitMask=1
      expect(wireItemStop.connections & 1).toBe(1);
    });

    it("connects an upward neighbor: bitMask 8 on start, 4 on stop", () => {
      const start = new Vector2(0, 0);
      const stop = new Vector2(0, 1);
      wireItemStart.position = new Vector2(0, 0);
      wireItemStop.position = new Vector2(0, 1);

      mockBlueprint.getBlueprintItemsAt
        .mockReturnValueOnce([wireItemStart])
        .mockReturnValueOnce([wireItemStop]);

      tool.buildAndConnect(start, stop);

      // connectAToB(start, stop): start.y(0) == stop.y(1)-1 → bitMask=4
      expect(wireItemStart.connections & 4).toBe(4);
      // connectAToB(stop, start): stop.y(1) == start.y(0)+1 → bitMask=8
      expect(wireItemStop.connections & 8).toBe(8);
    });

    it("emits blueprint changed after connecting wires", () => {
      const start = new Vector2(0, 0);
      const stop = new Vector2(1, 0);
      wireItemStart.position = new Vector2(0, 0);
      wireItemStop.position = new Vector2(1, 0);

      mockBlueprint.getBlueprintItemsAt
        .mockReturnValueOnce([wireItemStart])
        .mockReturnValueOnce([wireItemStop]);

      tool.buildAndConnect(start, stop);

      expect(mockBlueprint.emitBlueprintChanged).toHaveBeenCalled();
    });

    it("skips wire connection when no item found at start tile", () => {
      const start = new Vector2(0, 0);
      const stop = new Vector2(1, 0);
      mockBlueprint.getBlueprintItemsAt.mockReturnValue([]);

      tool.buildAndConnect(start, stop);

      expect(mockBlueprint.emitBlueprintChanged).not.toHaveBeenCalled();
    });

    it("skips wire logic for non-wire items", () => {
      templateItem.oniItem.isWire = false;
      const start = new Vector2(0, 0);
      const stop = new Vector2(1, 0);
      tool.buildAndConnect(start, stop);
      expect(mockBlueprint.getBlueprintItemsAt).not.toHaveBeenCalled();
    });
  });

  describe("dragStepByStep", () => {
    beforeEach(() => {
      vi.spyOn(tool, "buildAndConnect").mockImplementation(() => {});
    });

    it("calls buildAndConnect for each horizontal step", () => {
      // Move 3 tiles to the right: from (0.5, 0.5) to (3.5, 0.5)
      tool.dragStepByStep(new Vector2(0.5, 0.5), new Vector2(3.5, 0.5));
      expect(tool.buildAndConnect).toHaveBeenCalledTimes(3);
    });

    it("calls buildAndConnect for each vertical step", () => {
      // Move 2 tiles downward
      tool.dragStepByStep(new Vector2(0.5, 0.5), new Vector2(0.5, -1.5));
      expect(tool.buildAndConnect).toHaveBeenCalledTimes(2);
    });

    it("throws when the loop exceeds 999 iterations", () => {
      const mockBuildAndConnect = vi
        .spyOn(tool, "buildAndConnect")
        .mockImplementation(() => {});
      // Force > 999 iterations by providing huge coordinate delta
      // We spy on buildAndConnect but also need dragStepByStep to keep looping
      // Restore the real implementation for this test
      mockBuildAndConnect.mockRestore();
      vi.spyOn(tool, "buildAndConnect").mockImplementation(() => {});
      expect(() =>
        tool.dragStepByStep(new Vector2(0.5, 0.5), new Vector2(1500.5, 0.5)),
      ).toThrow("The tile dragger was too long");
    });
  });
});
