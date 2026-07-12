import { ScissorsTool } from "./scissors-tool";
import { CameraService, Overlay, Vector2 } from "../../../../../../lib/index";
import { ToolType } from "./tool";

const makeMockDrawPixi = () => {
  const sprite: any = {
    tint: 0,
    anchor: { set: vi.fn() },
    scale: { set: vi.fn() },
    position: { x: 0, y: 0 },
    angle: 0,
    visible: false,
    texture: { height: 200 },
  };
  return {
    drawTileRectangle: vi.fn(),
    getSpriteFrom: vi.fn().mockReturnValue(sprite),
    pixiApp: { stage: { addChild: vi.fn() } },
  } as any;
};

const makeWireItem = (overrides: any = {}) => ({
  oniItem: {
    isWire: true,
    objectLayer: 1,
    isOverlayPrimary: vi.fn().mockReturnValue(true),
  },
  connections: 0,
  position: new Vector2(0, 0),
  updateTileables: vi.fn(),
  ...overrides,
});

describe("ScissorsTool", () => {
  let tool: ScissorsTool;
  let mockBlueprintService: any;
  let mockBlueprint: any;
  let mockCameraService: any;

  beforeEach(() => {
    mockBlueprint = {
      getBlueprintItemsAt: vi.fn().mockReturnValue([]),
      pauseChangeEvents: vi.fn(),
      resumeChangeEvents: vi.fn(),
    };
    mockBlueprintService = { blueprint: mockBlueprint };
    mockCameraService = { overlay: Overlay.Power };
    vi.spyOn(CameraService, "cameraService", "get").mockReturnValue(
      mockCameraService as any,
    );
    tool = new ScissorsTool(mockBlueprintService as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("static properties", () => {
    it("has correct tool type", () => {
      expect(tool.toolType).toBe(ToolType.scissors);
    });

    it("is not toggleable", () => {
      expect(tool.toggleable).toBe(false);
    });

    it("captures input", () => {
      expect(tool.captureInput).toBe(true);
    });

    it("is not visible by default", () => {
      expect(tool.visible).toBe(false);
    });

    it("belongs to toolGroup 1 (exclusive with select/build)", () => {
      expect(tool.toolGroup).toBe(1);
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

  describe("plain click (mouseDown + dragStop, no drag)", () => {
    it("does nothing", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.dragStop();

      expect(mockBlueprint.getBlueprintItemsAt).not.toHaveBeenCalled();
      expect(mockBlueprint.pauseChangeEvents).not.toHaveBeenCalled();
    });
  });

  describe("dragStop with no prior mouseDown", () => {
    it("does nothing", () => {
      tool.dragStop();
      expect(mockBlueprint.getBlueprintItemsAt).not.toHaveBeenCalled();
    });
  });

  describe("dragging within the starting tile", () => {
    it("does not cut anything, since only one box is selected", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(2.6, 2.4)); // still tile (2,3)
      tool.dragStop();

      expect(mockBlueprint.getBlueprintItemsAt).not.toHaveBeenCalled();
    });
  });

  describe("dragging into a neighboring tile", () => {
    // startTile is (2,3): floor(2.5)=2, ceil(2.5)=3
    const start = () => new Vector2(2.5, 2.5);

    it("dragging right cuts the connection toward tile (3,3)", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 1 | 2, // Left + Right
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(wire.connections & 2).toBe(0); // Right cleared
      expect(wire.connections & 1).toBe(1); // Left untouched
    });

    it("dragging left cuts the connection toward tile (1,3)", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 1, // Left
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(1.5, 2.5));
      tool.dragStop();

      expect(wire.connections & 1).toBe(0);
    });

    it("dragging up cuts the connection toward tile (2,4)", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 4, // Up
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(2.5, 3.5));
      tool.dragStop();

      expect(wire.connections & 4).toBe(0);
    });

    it("dragging down cuts the connection toward tile (2,2)", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8, // Down
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(2.5, 1.5));
      tool.dragStop();

      expect(wire.connections & 8).toBe(0);
    });

    it("clears the opposite bit on the neighbor sharing the connection", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2,
      });
      const neighbor = makeWireItem({
        position: new Vector2(3, 3),
        connections: 1,
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        if (pos.x == 3 && pos.y == 3) return [neighbor];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(wire.connections & 2).toBe(0);
      expect(neighbor.connections & 1).toBe(0);
    });

    it("does nothing when there is no connection in the picked direction", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 1,
      }); // Left only
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(3.5, 2.5)); // Right
      tool.dragStop();

      expect(wire.connections).toBe(1);
      expect(wire.updateTileables).not.toHaveBeenCalled();
    });

    it("batches the change between pauseChangeEvents/resumeChangeEvents", () => {
      tool.mouseDown(new Vector2(2, 3), start());
      tool.drag(start(), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(mockBlueprint.pauseChangeEvents).toHaveBeenCalled();
      expect(mockBlueprint.resumeChangeEvents).toHaveBeenCalled();
    });
  });

  describe("direction is the dominant axis of the drag", () => {
    it("picks Right/Left when horizontal movement dominates, even with some vertical drift", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2,
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.9));
      tool.dragStop();

      expect(wire.connections & 2).toBe(0);
    });

    it("picks Up/Down when vertical movement dominates, even with some horizontal drift", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 4,
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(2.9, 3.5));
      tool.dragStop();

      expect(wire.connections & 4).toBe(0);
    });

    it("only the final direction at mouse-up is cut when the drag changes direction", () => {
      const wire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2 | 4, // Right + Up
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5)); // momentarily Right
      tool.drag(new Vector2(3.5, 2.5), new Vector2(2.5, 3.5)); // ends up Up
      tool.dragStop();

      expect(wire.connections & 4).toBe(0); // Up cut
      expect(wire.connections & 2).toBe(2); // Right left alone
    });
  });

  describe("overlay filtering", () => {
    it("only cuts connectables belonging to the currently viewed overlay", () => {
      const powerWire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2,
        oniItem: {
          isWire: true,
          objectLayer: 1,
          isOverlayPrimary: vi.fn().mockReturnValue(true),
        },
      });
      const gasPipe = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2,
        oniItem: {
          isWire: true,
          objectLayer: 5,
          isOverlayPrimary: vi.fn().mockReturnValue(false),
        },
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [powerWire, gasPipe];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(powerWire.connections & 2).toBe(0);
      expect(gasPipe.connections).toBe(2);
      expect(gasPipe.updateTileables).not.toHaveBeenCalled();
    });

    it("passes the active overlay through to isOverlayPrimary", () => {
      mockCameraService.overlay = Overlay.Gas;
      const gasPipe = makeWireItem({
        position: new Vector2(2, 3),
        connections: 2,
      });
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [gasPipe];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(gasPipe.oniItem.isOverlayPrimary).toHaveBeenCalledWith(
        Overlay.Gas,
      );
    });

    it("ignores non-wire items entirely", () => {
      const nonWire = {
        oniItem: {
          isWire: false,
          objectLayer: 1,
          isOverlayPrimary: vi.fn().mockReturnValue(true),
        },
        connections: 2,
        position: new Vector2(2, 3),
        updateTileables: vi.fn(),
      };
      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [nonWire];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));
      tool.dragStop();

      expect(nonWire.connections).toBe(2);
      expect(nonWire.updateTileables).not.toHaveBeenCalled();
    });
  });

  describe("switchFrom", () => {
    it("clears any in-progress selection", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));
      tool.switchFrom();

      const mockDrawPixi = makeMockDrawPixi();
      tool.draw(mockDrawPixi, {} as any);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });

    it("hides the ready icon if it was already showing", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));
      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = { currentZoom: 1, cameraOffset: new Vector2(0, 0) };
      tool.draw(mockDrawPixi, mockCamera as any);
      const sprite = mockDrawPixi.getSpriteFrom.mock.results[0].value;
      expect(sprite.visible).toBe(true);

      tool.switchFrom();

      expect(sprite.visible).toBe(false);
    });
  });

  describe("draw", () => {
    it("does not draw when no selection is in progress", () => {
      const mockDrawPixi = makeMockDrawPixi();
      tool.draw(mockDrawPixi, {} as any);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });

    it("draws a single-tile square while still within the starting tile", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));

      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = {} as any;
      tool.draw(mockDrawPixi, mockCamera);

      expect(mockDrawPixi.drawTileRectangle).toHaveBeenCalledWith(
        mockCamera,
        new Vector2(2, 3),
        new Vector2(3, 2),
        true,
        2,
        0xffc341,
        0xffc341,
        0.25,
        1,
      );
    });

    it("does not show the ready icon while only one tile is selected", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));

      const mockDrawPixi = makeMockDrawPixi();
      tool.draw(mockDrawPixi, {} as any);

      const sprite = mockDrawPixi.getSpriteFrom.mock.results[0].value;
      expect(sprite.visible).toBe(false);
    });

    it("draws a two-tile rectangle once a direction is picked", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5)); // Right -> neighbor (3,3)

      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = { currentZoom: 1, cameraOffset: new Vector2(0, 0) };
      tool.draw(mockDrawPixi, mockCamera as any);

      expect(mockDrawPixi.drawTileRectangle).toHaveBeenCalledWith(
        mockCamera,
        new Vector2(2, 3),
        new Vector2(4, 2),
        true,
        2,
        0xffc341,
        0xffc341,
        0.25,
        1,
      );
    });

    it("shows the ready icon at the midpoint of the two tiles, unrotated for a horizontal pick", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5)); // Right -> neighbor (3,3)

      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = { currentZoom: 40, cameraOffset: new Vector2(0, 0) };
      tool.draw(mockDrawPixi, mockCamera as any);

      const sprite = mockDrawPixi.getSpriteFrom.mock.results[0].value;
      expect(sprite.visible).toBe(true);
      expect(sprite.angle).toBe(0);
      expect(sprite.tint).toBe(0xffc341);
      // midpoint between tile (2,3) and (3,3) centers is world (3, 2.5)
      expect(sprite.position.x).toBeCloseTo(3 * 40);
      expect(sprite.position.y).toBeCloseTo(-2.5 * 40);
    });

    it("rotates the ready icon 90 degrees for a vertical pick", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(2.5, 4.5)); // Up -> neighbor (2,4)

      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = { currentZoom: 1, cameraOffset: new Vector2(0, 0) };
      tool.draw(mockDrawPixi, mockCamera as any);

      const sprite = mockDrawPixi.getSpriteFrom.mock.results[0].value;
      expect(sprite.angle).toBe(90);
    });

    it("reuses the same sprite across multiple draw calls instead of recreating it", () => {
      tool.mouseDown(new Vector2(2, 3), new Vector2(2.5, 2.5));
      tool.drag(new Vector2(2.5, 2.5), new Vector2(3.5, 2.5));

      const mockDrawPixi = makeMockDrawPixi();
      const mockCamera = { currentZoom: 1, cameraOffset: new Vector2(0, 0) };
      tool.draw(mockDrawPixi, mockCamera as any);
      tool.draw(mockDrawPixi, mockCamera as any);

      expect(mockDrawPixi.getSpriteFrom).toHaveBeenCalledTimes(1);
      expect(mockDrawPixi.pixiApp.stage.addChild).toHaveBeenCalledTimes(1);
    });
  });
});
