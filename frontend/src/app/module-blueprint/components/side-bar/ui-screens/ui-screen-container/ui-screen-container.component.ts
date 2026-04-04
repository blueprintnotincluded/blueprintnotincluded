import { Component, Input } from "@angular/core";
import { BlueprintItem } from "../../../../../../../../lib/index";

@Component({
  selector: "app-ui-screen-container",
  templateUrl: "./ui-screen-container.component.html",
  styleUrls: ["./ui-screen-container.component.css"],
  standalone: false,
})
export class UiScreenContainerComponent {
  @Input() blueprintItem!: BlueprintItem;

  get showSettings() {
    return this.blueprintItem.oniItem.uiScreens.length > 0;
  }
  get uiScreens() {
    return this.blueprintItem.oniItem.uiScreens;
  }
}
