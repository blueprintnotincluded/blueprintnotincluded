import {
  Component,
  OnInit,
  Input,
  ViewChildren,
  QueryList,
  ViewChild,
  Output,
  EventEmitter,
} from "@angular/core";
import { BuildableElement } from "../../../../../../../lib";
import { OverlayPanel } from "primeng/overlaypanel";

@Component({
  selector: "app-pipe-content",
  templateUrl: "./pipe-content.component.html",
  styleUrls: ["./pipe-content.component.css"],
  
})
export class PipeContentComponent {
  @Input() currentElement: BuildableElement;
  @Input() forceTag: string;
  @Output() selectElementPipe = new EventEmitter<BuildableElement>();

  @ViewChild("elementPanel", { static: false }) elementPanel: OverlayPanel;

  showElements(event: any) {
    this.elementPanel.toggle(event);
  }

  chooseElement(element: BuildableElement) {
    this.elementPanel.hide();
    this.selectElementPipe.emit(element);
  }
}
