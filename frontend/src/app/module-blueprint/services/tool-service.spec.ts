import { ToolService } from "./tool-service";
import { ToolType } from "../common/tools/tool";
import { Vector2 } from "../../../../../lib/index";
import { PlanningTool } from "../common/tools/planning-tool";

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
  keyDown: vi.fn(),
  draw: vi.fn(),
  parent: null as any,
});

describe("ToolService", () => {
  let service: ToolService;
  let mockSelect: ReturnType<typeof makeTool>;
  let mockBuild: ReturnType<typeof makeTool>;
  let mockElementReport: any;
  let mockScissors: ReturnType<typeof makeTool>;
  let mockPlanning: ReturnType<typeof makeTool>;

  beforeEach(() => {
    mockSelect = makeTool(ToolType.select);
    mockBuild = makeTool(ToolType.build);
    mockElementReport = {};
    mockScissors = makeTool(ToolType.scissors);
    mockPlanning = makeTool(ToolType.planning);

    service = new ToolService(
      mockSelect as any,
      mockBuild as any,
      mockElementReport,
      mockScissors as any,
      mockPlanning as unknown as PlanningTool,
    );
  });

  describe("getTool", () => {
    it("returns selectTool for ToolType.select", () => {
      expect(service.getTool(ToolType.select)).toBe(mockSelect);
    });

    it("returns buildTool for ToolType.build", () => {
      expect(service.getTool(ToolType.build)).toBe(mockBuild);
    });

    it("returns scissorsTool for ToolType.scissors", () => {
      expect(service.getTool(ToolType.scissors)).toBe(mockScissors);
    });

    it("returns planningTool for ToolType.planning", () => {
      expect(service.getTool(ToolType.planning)).toBe(mockPlanning);
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

    it("notifies multiple observers", () => {
      const obs1 = { toolChanged: vi.fn() };
      const obs2 = { toolChanged: vi.fn() };
      service.subscribeToolChanged(obs1);
      service.subscribeToolChanged(obs2);
      service.changeTool(ToolType.build);
      expect(obs1.toolChanged).toHaveBeenCalled();
      expect(obs2.toolChanged).toHaveBeenCalled();
    });
  });

  describe("input delegation to current tool", () => {
    it("delegates mouseDown", () => {
      const tile = new Vector2(1, 2);
      service.mouseDown(tile);
      expect(mockSelect.mouseDown).toHaveBeenCalledWith(tile, undefined);
    });

    it("delegates mouseDown with the float tile position", () => {
      const tile = new Vector2(1, 2);
      const tileFloat = new Vector2(1.4, 2.6);
      service.mouseDown(tile, tileFloat);
      expect(mockSelect.mouseDown).toHaveBeenCalledWith(tile, tileFloat);
    });

    it("delegates leftClick", () => {
      const tile = new Vector2(1, 2);
      service.leftClick(tile);
      expect(mockSelect.leftClick).toHaveBeenCalledWith(tile);
    });

    it("delegates rightClick", () => {
      const tile = new Vector2(1, 2);
      service.rightClick(tile);
      expect(mockSelect.rightClick).toHaveBeenCalledWith(tile);
    });

    it("delegates hover", () => {
      const tile = new Vector2(5, 6);
      service.hover(tile);
      expect(mockSelect.hover).toHaveBeenCalledWith(tile);
    });

    it("delegates drag", () => {
      const t1 = new Vector2(0, 0);
      const t2 = new Vector2(3, 3);
      service.drag(t1, t2);
      expect(mockSelect.drag).toHaveBeenCalledWith(t1, t2);
    });

    it("delegates dragStop", () => {
      service.dragStop();
      expect(mockSelect.dragStop).toHaveBeenCalled();
    });

    it("delegates mouseOut", () => {
      service.mouseOut();
      expect(mockSelect.mouseOut).toHaveBeenCalled();
    });

    it("delegates keyDown", () => {
      service.keyDown("Escape");
      expect(mockSelect.keyDown).toHaveBeenCalledWith("Escape");
    });
  });
});
