import {
  Component,
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
import { Popover } from "primeng/popover";

@Component({
  selector: "app-buildable-element-picker",
  templateUrl: "./buildable-element-picker.component.html",
  styleUrls: ["./buildable-element-picker.component.css"],
  standalone: false,
})
export class BuildableElementPickerComponent {
  @Input() buildableElementsArray!: BuildableElement[][];
  @Input() currentElement!: BuildableElement[];
  @Input() nbElements!: number[];
  @Input() isGasLiquid!: boolean;
  // Fieldset legend; the Replace strip reuses this picker under its own
  // labels ("Replace" / "with").
  @Input() legend: string = $localize`Elements`;
  // Tooltip for each element in the popover, defaulting to its name. The
  // Replace strip appends how many selected buildings an element would skip.
  @Input() tooltipFor: (element: BuildableElement) => string = (element) =>
    element.name;

  @Output() changeElement: EventEmitter<ElementChangeInfo> =
    new EventEmitter<ElementChangeInfo>();

  @ViewChildren(Popover) elementPanels!: QueryList<Popover>;

  private cameraService: CameraService;

  constructor() {
    this.cameraService = CameraService.cameraService;
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
