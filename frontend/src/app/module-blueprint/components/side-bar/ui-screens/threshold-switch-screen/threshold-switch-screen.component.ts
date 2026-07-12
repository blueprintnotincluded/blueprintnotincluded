import { Component, Input, OnInit } from "@angular/core";
import {
  BlueprintItem,
  BThresholdSwitchSideScreen,
} from "../../../../../../../../lib/index";

@Component({
  selector: "app-threshold-switch-screen",
  templateUrl: "./threshold-switch-screen.component.html",
  styleUrls: ["./threshold-switch-screen.component.css"],
  standalone: false,
})
export class ThresholdSwhitchScreenComponent implements OnInit {
  @Input() blueprintItem!: BlueprintItem;
  @Input() thresholdSwitchSideScreen!: BThresholdSwitchSideScreen;

  above!: boolean;
  value!: number;

  get correctedMaxRange() {
    if (this.blueprintItem.id == "LogicPressureSensorGas")
      return this.thresholdSwitchSideScreen.rangeMax * 1000;
    else if (this.thresholdSwitchSideScreen.thresholdValueUnits == " ºC")
      return 1000;
    else return this.thresholdSwitchSideScreen.rangeMax;
  }

  get correctedStep() {
    if (this.thresholdSwitchSideScreen.thresholdValueUnits == " ºC") return 0.1;
    else return this.thresholdSwitchSideScreen.incrementScale;
  }

  get correctedUnit() {
    if (this.thresholdSwitchSideScreen.thresholdValueUnits == "germs")
      return " germs";
    else return this.thresholdSwitchSideScreen.thresholdValueUnits;
  }

  get valueWithUnit() {
    let returnValue = "";
    let correctedValue = this.value.toString();
    if (this.thresholdSwitchSideScreen.thresholdValueUnits == " ºC")
      correctedValue = (this.value - 273.15).toFixed(1);

    returnValue = returnValue + correctedValue;
    returnValue = returnValue + this.correctedUnit;

    return returnValue;
  }

  get valueLabel() {
    return (this.above ? "Above " : "Below ") + this.valueWithUnit;
  }

  get tooltip() {
    let html = this.above
      ? this.thresholdSwitchSideScreen.aboveToolTip
      : this.thresholdSwitchSideScreen.belowToolTip;

    html = html.replace("{0}", this.valueWithUnit);

    return html;
  }

  get classAbove() {
    return (
      "button-item " + (this.above ? "p-button-info" : "p-button-secondary")
    );
  }
  get classBelow() {
    return (
      "button-item " + (this.above ? "p-button-secondary" : "p-button-info")
    );
  }

  constructor() {}

  ngOnInit() {
    this.value = this.blueprintItem.getUiSettings(
      this.thresholdSwitchSideScreen.id,
    )!.values[0] as number;
    this.above = this.blueprintItem.getUiSettings(
      this.thresholdSwitchSideScreen.id,
    )!.values[1] as boolean;
  }

  clickAbove() {
    this.above = true;
    this.blueprintItem.getUiSettings(
      this.thresholdSwitchSideScreen.id,
    )!.values[1] = this.above;
  }

  clickBelow() {
    this.above = false;
    this.blueprintItem.getUiSettings(
      this.thresholdSwitchSideScreen.id,
    )!.values[1] = this.above;
  }

  onChange() {
    this.blueprintItem.getUiSettings(
      this.thresholdSwitchSideScreen.id,
    )!.values[0] = this.value;
  }
}
