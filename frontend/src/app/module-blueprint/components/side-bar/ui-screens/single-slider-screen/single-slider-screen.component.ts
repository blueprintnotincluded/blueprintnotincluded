import { Component, Input, OnInit } from "@angular/core";
import {
  BlueprintItem,
  BSingleSliderSideScreen,
} from "../../../../../../../../lib/index";

@Component({
  selector: "app-single-slider-screen",
  templateUrl: "./single-slider-screen.component.html",
  styleUrls: ["./single-slider-screen.component.css"],
  standalone: false,
})
export class SingleSliderScreenComponent implements OnInit {
  @Input() blueprintItem!: BlueprintItem;
  @Input() singleSliderSideScreen!: BSingleSliderSideScreen;

  value!: number;

  get title() {
    return this.value + this.singleSliderSideScreen.sliderUnits;
  }
  get tooltip() {
    let html = this.singleSliderSideScreen.tooltip;

    if (html.includes("{1}")) {
      html = html.replace("{0}", "fuel");
      html = html.replace("{1}", this.value.toString());
    } else {
      html = html.replace("{0}", this.value.toString());
    }

    return html;
  }
  get step() {
    return 1 / Math.pow(10, this.singleSliderSideScreen.sliderDecimalPlaces);
  }

  constructor() {}

  ngOnInit() {
    this.value = this.blueprintItem.getUiSettings(
      this.singleSliderSideScreen.id
    )!.values[0] as number;
  }

  onChange() {
    this.blueprintItem.getUiSettings(
      this.singleSliderSideScreen.id
    )!.values[0] = this.value;
  }
}
