import { describe, it, expect, beforeEach, vi } from "vitest";
import { BniWorldNote, Vector2 } from "../../../../../../lib/index";
import { NoteEditPanelComponent } from "./note-edit-panel.component";
import { WorldNoteService } from "../../services/world-note.service";
import { NotesTool } from "../../common/tools/notes-tool";
import { ToolService } from "../../services/tool-service";
import { BlueprintService } from "../../services/blueprint-service";
import { ToolType } from "../../common/tools/tool";
import { KeybindingService } from "../../services/keybinding.service";

describe("NoteEditPanelComponent", () => {
  let component: NoteEditPanelComponent;
  let worldNoteService: WorldNoteService;
  let notesTool: NotesTool;
  let toolService: {
    changeTool: ReturnType<typeof vi.fn>;
    openNotesToolLike: ReturnType<typeof vi.fn>;
  };
  let blueprint: {
    worldNotes: BniWorldNote[];
    emitBlueprintChanged: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    blueprint = { worldNotes: [], emitBlueprintChanged: vi.fn() };
    const blueprintService = { blueprint } as unknown as BlueprintService;
    worldNoteService = new WorldNoteService(blueprintService);
    notesTool = new NotesTool(blueprintService, worldNoteService);
    toolService = { changeTool: vi.fn(), openNotesToolLike: vi.fn() };
    component = new NoteEditPanelComponent(
      worldNoteService,
      toolService as unknown as ToolService,
      notesTool,
      new KeybindingService(),
    );
  });

  it("shows the pending template after a placement, not the note just placed", () => {
    notesTool.visible = true;
    notesTool.mode = "text";
    notesTool.pendingTextNote.title = "next one";
    notesTool.mouseDown(new Vector2(1, 2));

    expect(blueprint.worldNotes).to.have.length(1);
    expect(component.isDraft).to.equal(true);
    expect(component.note).to.equal(notesTool.pendingTextNote);
  });

  it("shows the placed note once the user selects it", () => {
    notesTool.visible = true;
    const placed: BniWorldNote = { x: 3, y: 3, type: 0, title: "existing" };
    blueprint.worldNotes.push(placed);
    worldNoteService.select(placed);

    expect(component.isDraft).to.equal(false);
    expect(component.note).to.equal(placed);
  });

  it("shows nothing when the notes tool isn't active and nothing is selected", () => {
    notesTool.visible = false;
    expect(component.note).to.equal(null);
  });

  it("pickColor keeps the stored alpha byte and commits a placed note", () => {
    const placed: BniWorldNote = {
      x: 3,
      y: 3,
      type: 0,
      title: "existing",
      tinthex: "ff000080",
    };
    blueprint.worldNotes.push(placed);
    worldNoteService.select(placed);

    component.pickColor("00ff00");

    expect(placed.tinthex).to.equal("00ff0080");
    expect(blueprint.emitBlueprintChanged).toHaveBeenCalledTimes(1);
  });

  // The pending note is not in the blueprint: recolouring the creation
  // template must not push an undo step.
  it("pickColor on the creation template commits nothing", () => {
    notesTool.visible = true;
    notesTool.mode = "text";
    const notes = blueprint.worldNotes;

    component.pickColor("0000ff");

    expect(notesTool.pendingTextNote.tinthex).to.equal("0000ffff");
    expect(blueprint.worldNotes).to.equal(notes);
    expect(blueprint.emitBlueprintChanged).not.toHaveBeenCalled();
  });

  // The same link the terrain and dig panels have to their tools.
  it("placeMore() hands the selected note to the Notes tool as its brush", () => {
    const note: BniWorldNote = { x: 1, y: 1, type: 1, id: 7 };
    blueprint.worldNotes.push(note);
    worldNoteService.select(note);

    component.placeMore();

    expect(toolService.openNotesToolLike).toHaveBeenCalledWith(note);
  });

  it("names the delete key on the Delete button", () => {
    expect(component.deleteLabel).toBe("Delete note (Del)");
  });

  it("close() from the draft template returns to the select tool", () => {
    notesTool.visible = true;
    component.close();
    expect(toolService.changeTool).toHaveBeenCalledWith(ToolType.select);
  });

  it("close() from a selected note clears the selection instead of switching tools", () => {
    notesTool.visible = true;
    const placed: BniWorldNote = { x: 3, y: 3, type: 0, title: "existing" };
    blueprint.worldNotes.push(placed);
    worldNoteService.select(placed);

    component.close();

    expect(toolService.changeTool).not.toHaveBeenCalled();
    expect(worldNoteService.selected).to.equal(null);
  });
});
