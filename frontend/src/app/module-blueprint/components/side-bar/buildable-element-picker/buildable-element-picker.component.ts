import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ViewChildren,
  QueryList,
} from "@angular/core";
import {
  CameraService,
  Visualization,
  BuildableElement,
} from "../../../../../../../lib/index";
import { OverlayPanel } from "primeng/overlaypanel";

@Component({
  selector: "app-buildable-element-picker",
  templateUrl: "./buildable-element-picker.component.html",
  styleUrls: ["./buildable-element-picker.component.css"],
  
})
export class BuildableElementPickerComponent implements OnInit {
  @Input() buildableElementsArray: BuildableElement[][];
  @Input() currentElement: BuildableElement[];
  @Input() nbElements: number[];
  @Input() isGasLiquid: boolean;

  @Output() changeElement: EventEmitter<ElementChangeInfo> =
    new EventEmitter<ElementChangeInfo>();

  @ViewChildren(OverlayPanel) elementPanels!: QueryList<OverlayPanel>;

  private cameraService: CameraService;

  constructor() {
    this.cameraService = CameraService.cameraService;
  }

  ngOnInit() {
    1; // required for type
  }

  showWarning(indexElement: number) {
    return this.nbElements != null && this.nbElements[indexElement] > 1;
  }

  showElements(event: any, indexElement: number) {
    let currentIndexElement = 0;
    this.elementPanels.forEach((elementPanel) => {
      if (indexElement == currentIndexElement) elementPanel.toggle(event);
      else elementPanel.hide();

      currentIndexElement++;
    });
  }

  chooseElement(buildableElement: BuildableElement, index: number) {
    this.changeElement.emit({ newElement: buildableElement, index: index });
    this.elementPanels.forEach((elementPanel) => {
      elementPanel.hide();
    });

    this.currentElement[index] = buildableElement;
  }

  elementsVisualization() {
    this.cameraService.visualization = Visualization.elements;
  }
}

export interface ElementChangeInfo {
  newElement: BuildableElement;
  index: number;
}
