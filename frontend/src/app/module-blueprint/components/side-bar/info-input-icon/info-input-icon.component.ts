import { Component, OnInit, Input } from "@angular/core";

@Component({
  selector: "app-info-input-icon",
  templateUrl: "./info-input-icon.component.html",
  styleUrls: ["./info-input-icon.component.css"],
  
})
export class InfoInputIconComponent {
  @Input() width: number;
  @Input() height: number;
  @Input() frontColor: string;
  @Input() backColor: string;
  @Input() svgPath: string;
}
