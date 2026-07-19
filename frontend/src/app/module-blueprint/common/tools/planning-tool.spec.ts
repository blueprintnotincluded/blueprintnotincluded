import { PlanningTool } from "./planning-tool";
import { ToolType } from "./tool";
import { Vector2 } from "../../../../../../lib/index";

describe("PlanningTool", () => {
  let tool: PlanningTool;
  let blueprint: any;

  beforeEach(() => {
    blueprint = { planningToolShapes: [], emitBlueprintChanged: vi.fn() };
    tool = new PlanningTool({ blueprint } as any);
  });

  it("is an exclusive input tool", () => {
    expect(tool.toolType).toBe(ToolType.planning);
    expect(tool.toolGroup).toBe(1);
    expect(tool.captureInput).toBe(true);
  });

  it("adds a shape using the selected shape and color", () => {
    tool.shape = 2;
    tool.color = 8;
    tool.mouseDown(new Vector2(4, 5));
    expect(blueprint.planningToolShapes).to.deep.equal([
      { x: 4, y: 5, shape: 2, color: 8 },
    ]);
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalledOnce();
  });

  it("replaces an existing shape at the same cell", () => {
    blueprint.planningToolShapes.push({ x: 4, y: 5, shape: 0, color: 0 });
    tool.shape = 1;
    tool.color = 3;
    tool.mouseDown(new Vector2(4, 5));
    expect(blueprint.planningToolShapes).to.deep.equal([
      { x: 4, y: 5, shape: 1, color: 3 },
    ]);
  });

  it("erases a shape and ignores empty cells", () => {
    blueprint.planningToolShapes.push({ x: 1, y: 2, shape: 0, color: 1 });
    tool.erase = true;
    tool.mouseDown(new Vector2(1, 2));
    tool.mouseDown(new Vector2(9, 9));
    expect(blueprint.planningToolShapes).to.deep.equal([]);
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalledOnce();
  });
});
