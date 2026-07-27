import { NotesTool } from "./notes-tool";
import { ToolType } from "./tool";
import { ShortcutAction } from "../../keybindings/shortcut-actions";
import { BniWorldNote, Vector2 } from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import { WorldNoteService } from "../../services/world-note.service";

describe("NotesTool", () => {
  let tool: NotesTool;
  let blueprint: {
    worldNotes: BniWorldNote[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };
  let worldNoteService: WorldNoteService;
  let parent: { changeTool: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    blueprint = { worldNotes: [], emitBlueprintChanged: vi.fn() };
    const blueprintService = { blueprint } as unknown as BlueprintService;
    worldNoteService = new WorldNoteService(blueprintService);
    tool = new NotesTool(blueprintService, worldNoteService);
    parent = { changeTool: vi.fn() };
    tool.parent = parent as any;
  });

  it("is an exclusive input tool", () => {
    expect(tool.toolType).toBe(ToolType.notes);
    expect(tool.toolGroup).toBe(1);
    expect(tool.captureInput).toBe(true);
    expect(tool.toggleable).toBe(false);
  });

  it("places a text note built from the pending tint", () => {
    tool.mode = "text";
    tool.pendingTint = "ff0000ff";
    tool.mouseDown(new Vector2(4, 5));

    expect(blueprint.worldNotes).to.have.length(1);
    expect(blueprint.worldNotes[0]).to.deep.include({
      x: 4,
      y: 5,
      type: 0,
      tinthex: "ff0000ff",
    });
    expect(worldNoteService.selected).to.equal(blueprint.worldNotes[0]);
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalledOnce();
  });

  it("places an element note built from the pending template", () => {
    tool.mode = "element";
    tool.pendingElementNote = {
      x: 0,
      y: 0,
      type: 1,
      id: 7,
      mass: 100,
      temp: 300,
    };
    tool.mouseDown(new Vector2(1, 2));

    expect(blueprint.worldNotes).to.deep.equal([
      { x: 1, y: 2, type: 1, id: 7, mass: 100, temp: 300 },
    ]);
    expect(worldNoteService.selected).to.equal(blueprint.worldNotes[0]);
  });

  it("refuses a second note on an occupied cell and selects the existing one instead", () => {
    const existing: BniWorldNote = { x: 3, y: 3, type: 0, title: "existing" };
    blueprint.worldNotes.push(existing);

    tool.mouseDown(new Vector2(3, 3));

    expect(blueprint.worldNotes).to.have.length(1);
    expect(worldNoteService.selected).to.equal(existing);
    expect(blueprint.emitBlueprintChanged).not.toHaveBeenCalled();
  });

  it("right-click returns to the select tool", () => {
    tool.rightClick(new Vector2(0, 0));
    expect(parent.changeTool).toHaveBeenCalledWith(ToolType.select);
  });

  it("handles interfaceCancel by returning to the select tool", () => {
    expect(tool.handleShortcut(ShortcutAction.interfaceCancel)).toBe(true);
    expect(parent.changeTool).toHaveBeenCalledWith(ToolType.select);
  });

  it("declines shortcuts it does not own", () => {
    expect(tool.handleShortcut(ShortcutAction.editDelete)).toBe(false);
  });
});
