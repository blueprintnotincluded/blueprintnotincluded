import { ComponentSideSelectionToolComponent } from "./selection-tool.component";
import { KeybindingService } from "../../../services/keybinding.service";

// The accordion is the only view of which same-item groups are selected, so
// its open panels and the select tool's `selected` flags must stay in step in
// both directions.
describe("ComponentSideSelectionToolComponent", () => {
  let collections: { selected: boolean }[];
  let component: ComponentSideSelectionToolComponent;

  beforeEach(() => {
    collections = [{ selected: false }, { selected: true }, { selected: true }];
    component = new ComponentSideSelectionToolComponent(
      { selectTool: { sameItemCollections: collections } } as any,
      {} as any,
      new KeybindingService(),
    );
  });

  it("opens the panels of the selected groups", () => {
    expect(component.activePanels).toEqual([1, 2]);
  });

  it("selects exactly the group a single-panel change opens", () => {
    component.onPanelChange(0);
    expect(collections.map((c) => c.selected)).toEqual([true, false, false]);
  });

  it("selects every group a multi-panel change opens", () => {
    component.onPanelChange([0, 2]);
    expect(collections.map((c) => c.selected)).toEqual([true, false, true]);
  });
});
