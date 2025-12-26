import { BlueprintService } from "../../services/blueprint-service";
import { Injectable } from "@angular/core";
import {
  BlueprintItemElement,
  BlueprintItem,
  IObsBlueprintChange,
  DrawHelpers,
  BuildableElement,
} from "../../../../../../lib/index";

@Injectable()
export class ElementReport implements IObsBlueprintChange {
  data: ElementReportDataItem[];

  constructor(private blueprintService: BlueprintService) {
    this.data = [];

    this.blueprintService.blueprint.subscribeBlueprintChanged(this);
  }

  updateElementReport() {
    this.data = [];

    this.blueprintService.blueprint.blueprintItems.map((item) => {
      if (item.oniItem.isElement)
        this.addElementToReport(
          item.buildableElements[0],
          (item as BlueprintItemElement).mass
        );
      else
        for (
          let elementIndex = 0;
          elementIndex < item.oniItem.buildableElementsArray.length;
          elementIndex++
        ) {
          this.addElementToReport(
            item.buildableElements[elementIndex],
            item.oniItem.materialMass[elementIndex]
          );
        }
    });

    this.data = this.data.sort((i1, i2) => {
      return i2.totalMass - i1.totalMass;
    });
  }

  private addElementToReport(buildableElement: BuildableElement, mass: number) {
    let alreadyPresent = false;
    this.data.map((dataItem) => {
      if (dataItem.buildableElement == buildableElement) {
        alreadyPresent = true;
        dataItem.totalMass += mass;
      }
    });

    if (!alreadyPresent) {
      this.data.push({
        buildableElement: buildableElement,
        colorString: DrawHelpers.colorToHex(buildableElement.color),
        totalMass: mass,
      });
    }
  }

  // Blueprint Change interface
  itemDestroyed() {}
  itemAdded(blueprintItem: BlueprintItem) {}
  blueprintChanged() {
    this.updateElementReport();
  }
}

export interface ElementReportDataItem {
  buildableElement: BuildableElement;
  colorString: string;
  totalMass: number;
}
