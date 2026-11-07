import { describe, it, expect, beforeEach, vi } from "vitest";
import { DigSelectionPanelComponent } from "./dig-selection-panel.component";
import { DigSelectionService } from "../../services/dig-selection.service";
import { GameStringService } from "../../services/game-string-service";
import { KeybindingService } from "../../services/keybinding.service";
import { ToolService } from "../../services/tool-service";
import { ToolType } from "../../common/tools/tool";

describe("DigSelectionPanelComponent", () => {
  let component: DigSelectionPanelComponent;
  let digSelection: {
    selected: { x: number; y: number }[] | null;
    erase: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let toolService: { changeTool: ReturnType<typeof vi.fn> };
  let gameStrings: { dict?: Record<string, string> };

  beforeEach(() => {
    digSelection = { selected: null, erase: vi.fn(), clear: vi.fn() };
    toolService = { changeTool: vi.fn() };
    gameStrings = {};
    component = new DigSelectionPanelComponent(
      digSelection as unknown as DigSelectionService,
      toolService as unknown as ToolService,
      gameStrings as unknown as GameStringService,
      new KeybindingService(),
    );
  });

  it("shows nothing while no dig area is selected", () => {
    expect(component.cellCount).toBe(null);
  });

  it("counts the selected cells", () => {
    digSelection.selected = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(component.cellCount).toBe(2);
  });

  it("titles itself with the game's name for a dig", () => {
    expect(component.title).toBe("Dig");
    gameStrings.dict = { "STRINGS.MISC.PLACERS.DIGPLACER.NAME": "Dig!" };
    expect(component.title).toBe("Dig!");
  });

  it("erases, closes and opens the Dig tool", () => {
    component.erase();
    expect(digSelection.erase).toHaveBeenCalled();
    component.close();
    expect(digSelection.clear).toHaveBeenCalled();
    component.openDigTool();
    expect(toolService.changeTool).toHaveBeenCalledWith(ToolType.dig);
  });
});
