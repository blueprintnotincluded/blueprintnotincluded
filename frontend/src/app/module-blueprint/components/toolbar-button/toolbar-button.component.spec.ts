import { ToolbarButtonComponent } from "./toolbar-button.component";

describe("ToolbarButtonComponent", () => {
  it("names the tool's key in the tooltip when it has one", () => {
    const button = new ToolbarButtonComponent();
    button.label = "Select";
    expect(button.tooltip).toBe("Select");
    button.hint = "V";
    expect(button.tooltip).toBe("Select (V)");
  });
});
