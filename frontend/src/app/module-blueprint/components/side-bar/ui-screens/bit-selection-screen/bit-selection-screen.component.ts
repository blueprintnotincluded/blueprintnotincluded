import { Component, OnInit, Input } from "@angular/core";
import {
  BBitSelectorSideScreen,
  BlueprintItem,
} from "../../../../../../../../lib";

@Component({
  selector: "app-bit-selection-screen",
  templateUrl: "./bit-selection-screen.component.html",
  styleUrls: ["./bit-selection-screen.component.css"],
  
})
export class BitSelectionScreenComponent implements OnInit {
  @Input() blueprintItem: BlueprintItem;
  @Input() bitSelectorSideScreen: BBitSelectorSideScreen;

  value: number;
  buttonValues: boolean[];

  get title() {
    return this.bitSelectorSideScreen.title;
  }

  get description() {
    return this.bitSelectorSideScreen.description;
  }

  ngOnInit(): void {
    this.buttonValues = [];
    this.value = this.blueprintItem.getUiSettings(this.bitSelectorSideScreen.id)
      .values[0] as number;

    this.updateButtonValues();
  }

  updateButtonValues() {
    for (let i = 0; i < 4; i++) {
      this.buttonValues[i] = i == this.value;
    }
  }

  clickBit(index: number) {
    this.value = index;
    this.updateButtonValues();
    this.blueprintItem.getUiSettings(this.bitSelectorSideScreen.id).values[0] =
      index;
  }

  classButton(index: number) {
    return (
      "button-item bitButton " +
      (this.buttonValues[index] ? "p-button-info" : "p-button-secondary")
    );
  }
}
