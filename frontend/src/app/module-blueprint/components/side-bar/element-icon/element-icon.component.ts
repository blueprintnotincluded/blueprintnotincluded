import { Component, Input } from "@angular/core";
import {
  DrawHelpers,
  BuildableElement,
  ElementState,
} from "../../../../../../../lib/index";

@Component({
  selector: "app-element-icon",
  templateUrl: "./element-icon.component.html",
  styleUrls: ["./element-icon.component.css"],
  standalone: false,
})
export class ElementIconComponent {
  @Input() element!: BuildableElement;
  @Input() width!: string;
  @Input() height!: string;

  get isIcon() {
    return !this.isGas && !this.isLiquid;
  }
  get nullIcon() {
    return this.element.icon == null || this.element.icon == "";
  }
  // `state` (from the #176 element-defaults export) is the authoritative
  // phase-of-matter field; fall back to the oreTags check only when it is
  // unset (Vacuum), e.g. a database predating that export. Without this,
  // solid elements whose oreTags happen to carry a stale/missing signal fall
  // through to the generic "no icon" circle instead of their real iconUrl.
  get isLiquid() {
    if (this.element.state !== ElementState.Vacuum)
      return this.element.state === ElementState.Liquid;
    return this.element.hasTag("Liquid");
  }
  get isGas() {
    if (this.element.state !== ElementState.Vacuum)
      return this.element.state === ElementState.Gas;
    return this.element.hasTag("Gas");
  }
  get tint() {
    return DrawHelpers.colorToHex(this.element.uiColor);
  }
  get style() {
    return "height: " + this.height + ";";
  }
}
