import { Component, OnInit, Input, ViewChild } from "@angular/core";
import {
  BlueprintItemInfo,
  InfoIcon,
} from "../../../../../../../lib/src/blueprint/blueprint-item-info";
import { Popover } from "primeng/popover";

@Component({
  selector: "app-info-input",
  templateUrl: "./info-input.component.html",
  styleUrls: ["./info-input.component.css"],
  standalone: false,
})
export class InfoInputComponent implements OnInit {
  @Input() blueprintIteminfo!: BlueprintItemInfo;

  @ViewChild("iconPanel") iconPanel!: Popover;

  iconList: InfoIcon[] = [
    InfoIcon.icon_inf,
    InfoIcon.icon_exc,
    InfoIcon.icon_int,
    InfoIcon.icon_no1,
    InfoIcon.icon_no2,
    InfoIcon.icon_no3,
    InfoIcon.icon_no4,
    InfoIcon.icon_no5,
    InfoIcon.icon_no6,
    InfoIcon.icon_no7,
    InfoIcon.icon_no8,
    InfoIcon.icon_no9,
  ];

  get infoString(): string {
    return this.blueprintIteminfo.infoString;
  }
  set infoString(value: string) {
    this.blueprintIteminfo.infoString = value;
  }
  get title(): string {
    return this.blueprintIteminfo.title;
  }
  set title(value: string) {
    this.blueprintIteminfo.title = value;
  }
  get iconSvgPath() {
    return this.blueprintIteminfo.htmlSvgPath;
  }

  frontColor: string = "#ffffff";
  backColor: string = "#007AD9";

  constructor() {}

  ngOnInit(): void {
    this.frontColor = this.blueprintIteminfo.htmlFrontColor;
    this.backColor = this.blueprintIteminfo.htmlBackColor;
  }

  showIcons(event: any) {
    this.iconPanel.toggle(event);
  }

  chooseIcon(icon: InfoIcon) {
    this.blueprintIteminfo.icon = icon;
    this.iconPanel.hide();
    this.blueprintIteminfo.reloadCamera = true;
  }

  colorChange() {
    let frontColorString = this.frontColor.replace("#", "0x");
    this.blueprintIteminfo.frontColor = parseInt(frontColorString, 16);
    let backColorString = this.backColor.replace("#", "0x");
    this.blueprintIteminfo.backColor = parseInt(backColorString, 16);
    this.blueprintIteminfo.reloadCamera = true;
  }

  iconSvgPathFromIcon(icon: InfoIcon) {
    return BlueprintItemInfo.getIconSvgPath(icon);
  }
}
