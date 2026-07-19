import { Component } from "@angular/core";
import { PlanningTool } from "../../../common/tools/planning-tool";
import { PLANNING_COLORS } from "../../../drawing/draw-planning-overlay";

@Component({
  selector: "app-planning-tool",
  templateUrl: "./planning-tool.component.html",
  styleUrls: ["./planning-tool.component.css"],
  standalone: false,
})
export class PlanningToolComponent {
  readonly shapes = [
    { value: 0, label: $localize`Square` },
    { value: 1, label: $localize`Circle` },
    { value: 2, label: $localize`Diamond` },
  ];
  readonly colors = PLANNING_COLORS.map((color, value) => ({
    value,
    css: `#${color.toString(16).padStart(6, "0")}`,
  }));

  constructor(public tool: PlanningTool) {}
}
