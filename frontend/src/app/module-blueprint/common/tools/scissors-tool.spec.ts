import { ScissorsTool } from "./scissors-tool";
import { Vector2 } from "../../../../../../lib/index";
import { ToolType } from "./tool";

const makeWireItem = (overrides: any = {}) => ({
  oniItem: { isWire: true, objectLayer: 1 },
  connections: 0,
  position: new Vector2(0, 0),
  updateTileables: vi.fn(),
  ...overrides,
});

describe("ScissorsTool", () => {
  let tool: ScissorsTool;
  let mockBlueprintService: any;
  let mockBlueprint: any;

  beforeEach(() => {
    mockBlueprint = {
      getBlueprintItemsAt: vi.fn().mockReturnValue([]),
      pauseChangeEvents: vi.fn(),
      resumeChangeEvents: vi.fn(),
    };
    mockBlueprintService = { blueprint: mockBlueprint };
    tool = new ScissorsTool(mockBlueprintService as any);
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

  describe("dragStop with no prior mouseDown/drag", () => {
    it("does nothing", () => {
      tool.dragStop();
      expect(mockBlueprint.getBlueprintItemsAt).not.toHaveBeenCalled();
    });
  });

  describe("click (mouseDown + dragStop, no drag in between)", () => {
    // Click at world (2.2, 2.1) -> tile (2,3) [floor x, ceil y]
    // local coords within tile: x=0.2, y=3-2.1=0.9 -> falls only in the "Down" zone
    it("resolves the click to a single triangle of control and cuts only that connection", () => {
      const wireAtClick = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8, // Down bit set
      });
      const neighborBelow = makeWireItem({
        position: new Vector2(2, 2),
        connections: 4, // Up bit set (opposite side of the same link)
      });

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wireAtClick];
        if (pos.x == 2 && pos.y == 2) return [neighborBelow];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.2, 2.1));
      tool.dragStop();

      expect(wireAtClick.connections & 8).toBe(0);
      expect(neighborBelow.connections & 4).toBe(0);
      expect(wireAtClick.updateTileables).toHaveBeenCalledWith(mockBlueprint);
      expect(neighborBelow.updateTileables).toHaveBeenCalledWith(mockBlueprint);
    });

    it("leaves connections in other zones untouched", () => {
      const wireAtClick = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8 | 1, // Down + Left
      });

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wireAtClick];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.2, 2.1));
      tool.dragStop();

      expect(wireAtClick.connections & 8).toBe(0);
      expect(wireAtClick.connections & 1).toBe(1);
    });

    it("does not affect a wire with no connection in the clicked zone", () => {
      const wireAtClick = makeWireItem({
        position: new Vector2(2, 3),
        connections: 1, // Left only, click zone is Down
      });

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wireAtClick];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.2, 2.1));
      tool.dragStop();

      expect(wireAtClick.connections).toBe(1);
      expect(wireAtClick.updateTileables).not.toHaveBeenCalled();
    });
  });

  describe("drag across multiple tiles", () => {
    it("cuts all connections whose zone is covered by the box, across every overlapping tile", () => {
      // Box covers the whole of tile (0,1) and tile (1,1) entirely
      const wireA = makeWireItem({
        position: new Vector2(0, 1),
        connections: 1 | 2 | 4 | 8,
      });
      const wireB = makeWireItem({
        position: new Vector2(1, 1),
        connections: 1 | 2 | 4 | 8,
      });

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 0 && pos.y == 1) return [wireA];
        if (pos.x == 1 && pos.y == 1) return [wireB];
        return [];
      });

      tool.mouseDown(new Vector2(0, 1), new Vector2(0, 1));
      tool.drag(new Vector2(0, 1), new Vector2(2, 0));
      tool.dragStop();

      expect(wireA.connections).toBe(0);
      expect(wireB.connections).toBe(0);
    });

    it("batches the changes between pauseChangeEvents/resumeChangeEvents", () => {
      tool.mouseDown(new Vector2(0, 1), new Vector2(0, 1));
      tool.drag(new Vector2(0, 1), new Vector2(2, 0));
      tool.dragStop();

      expect(mockBlueprint.pauseChangeEvents).toHaveBeenCalled();
      expect(mockBlueprint.resumeChangeEvents).toHaveBeenCalled();
    });
  });

  describe("connectable-type isolation", () => {
    it("cuts each stacked connectable independently based on its own bitmask", () => {
      const powerWire = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8,
        oniItem: { isWire: true, objectLayer: 1 },
      });
      const gasPipe = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8,
        oniItem: { isWire: true, objectLayer: 5 },
      });
      const nonWireDecoration = {
        oniItem: { isWire: false, objectLayer: 9 },
        connections: 8,
        position: new Vector2(2, 3),
        updateTileables: vi.fn(),
      };

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3)
          return [powerWire, gasPipe, nonWireDecoration];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.2, 2.1));
      tool.dragStop();

      expect(powerWire.connections & 8).toBe(0);
      expect(gasPipe.connections & 8).toBe(0);
      // Non-wire items are never touched (isWire filter)
      expect(nonWireDecoration.connections).toBe(8);
      expect(nonWireDecoration.updateTileables).not.toHaveBeenCalled();
    });

    it("only clears the opposite bit on neighbors sharing the same objectLayer", () => {
      const wireAtClick = makeWireItem({
        position: new Vector2(2, 3),
        connections: 8,
        oniItem: { isWire: true, objectLayer: 1 },
      });
      const sameLayerNeighbor = makeWireItem({
        position: new Vector2(2, 2),
        connections: 4,
        oniItem: { isWire: true, objectLayer: 1 },
      });
      const otherLayerNeighbor = makeWireItem({
        position: new Vector2(2, 2),
        connections: 4,
        oniItem: { isWire: true, objectLayer: 2 },
      });

      mockBlueprint.getBlueprintItemsAt.mockImplementation((pos: Vector2) => {
        if (pos.x == 2 && pos.y == 3) return [wireAtClick];
        if (pos.x == 2 && pos.y == 2)
          return [sameLayerNeighbor, otherLayerNeighbor];
        return [];
      });

      tool.mouseDown(new Vector2(2, 3), new Vector2(2.2, 2.1));
      tool.dragStop();

      expect(sameLayerNeighbor.connections & 4).toBe(0);
      expect(otherLayerNeighbor.connections & 4).toBe(4);
    });
  });

  describe("switchFrom", () => {
    it("clears any in-progress selection", () => {
      tool.mouseDown(new Vector2(0, 0), new Vector2(0.5, 0.5));
      tool.switchFrom();

      const mockDrawPixi = { drawTileRectangle: vi.fn() } as any;
      tool.draw(mockDrawPixi, {} as any);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });
  });

  describe("draw", () => {
    it("does not draw when no selection is in progress", () => {
      const mockDrawPixi = { drawTileRectangle: vi.fn() } as any;
      tool.draw(mockDrawPixi, {} as any);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });

    it("draws a preview rectangle while a selection is in progress", () => {
      tool.mouseDown(new Vector2(0, 0), new Vector2(0.5, 0.5));
      tool.drag(new Vector2(0.5, 0.5), new Vector2(2.5, -1.5));

      const mockDrawPixi = { drawTileRectangle: vi.fn() } as any;
      tool.draw(mockDrawPixi, {} as any);
      expect(mockDrawPixi.drawTileRectangle).toHaveBeenCalled();
    });
  });
});
