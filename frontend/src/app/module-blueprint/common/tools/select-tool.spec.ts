import { SelectTool } from "./select-tool";
import { Vector2 } from "../../../../../../lib/index";

describe("SelectTool", () => {
  let tool: SelectTool;
  let mockBlueprintService: any;
  let mockDrawPixi: any;
  let mockCamera: any;

  beforeEach(() => {
    mockBlueprintService = {
      blueprint: {
        getBlueprintItemsAt: () => [],
      },
    };
    mockDrawPixi = {
      drawTileRectangle: vi.fn(),
    };
    mockCamera = {
      cameraOffset: { x: 0, y: 0 },
      currentZoom: 32,
    };
    tool = new SelectTool(mockBlueprintService as any);
  });

  describe("draw()", () => {
    it("should not draw when no drag is active", () => {
      tool.draw(mockDrawPixi, mockCamera);
      expect(mockDrawPixi.drawTileRectangle).not.toHaveBeenCalled();
    });

    it("should draw selection rectangle while dragging", () => {
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
      expect(topLeft.x).toBe(1);
      expect(topLeft.y).toBe(5);
      expect(bottomRight.x).toBe(4);
      expect(bottomRight.y).toBe(2);
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
  });
});
