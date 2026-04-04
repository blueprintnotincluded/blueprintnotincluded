import { Component, Input, OnInit } from "@angular/core";
import {
  BlueprintItem,
  BActiveRangeSideScreen,
} from "../../../../../../../../lib/index";

@Component({
  selector: "app-active-range-screen",
  templateUrl: "./active-range-screen.component.html",
  styleUrls: ["./active-range-screen.component.css"],
  standalone: false,
})
export class ActiveRangeScreenComponent implements OnInit {
  @Input() blueprintItem!: BlueprintItem;
  @Input() activeRangeSideScreen!: BActiveRangeSideScreen;

  get activateTooltip() {
    let toolip = this.activeRangeSideScreen.activateTooltip;
    toolip = toolip.replace("{0}", this.values[1].toString());
    toolip = toolip.replace("{1}", this.values[0].toString());
    return toolip;
  }
  get deactivateTooltip() {
    let toolip = this.activeRangeSideScreen.deactivateTooltip;
    toolip = toolip.replace("{0}", this.values[0].toString());
    toolip = toolip.replace("{1}", this.values[1].toString());
    return toolip;
  }

  values!: number[];

  constructor() {}

  ngOnInit() {
    this.values = [];
    this.values[0] = this.blueprintItem.getUiSettings(
      this.activeRangeSideScreen.id
    )!.values[0] as number;
    this.values[1] = this.blueprintItem.getUiSettings(
      this.activeRangeSideScreen.id
    )!.values[1] as number;
  }

  onChange() {
    this.blueprintItem.getUiSettings(this.activeRangeSideScreen.id)!.values[0] =
      this.values[0];
    this.blueprintItem.getUiSettings(this.activeRangeSideScreen.id)!.values[1] =
      this.values[1];
  }
}
