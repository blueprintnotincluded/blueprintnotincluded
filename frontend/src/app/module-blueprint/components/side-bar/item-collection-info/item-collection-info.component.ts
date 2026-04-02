import { Component, OnInit, Input, ElementRef, ViewChild } from "@angular/core";
import {
  SameItemCollection,
  IObsSelected,
} from "src/app/module-blueprint/common/tools/same-item-collection";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ToolType } from "src/app/module-blueprint/common/tools/tool";
import {
  BlueprintHelpers,
  ZIndex,
  BuildableElement,
  BlueprintItemWire,
} from "../../../../../../../lib/index";
import { ElementChangeInfo } from "../buildable-element-picker/buildable-element-picker.component";
import { BlueprintItemInfo } from "../../../../../../../lib/src/blueprint/blueprint-item-info";

@Component({
  selector: "app-item-collection-info",
  templateUrl: "./item-collection-info.component.html",
  styleUrls: ["./item-collection-info.component.css"],
  standalone: false,
})
export class ItemCollectionInfoComponent implements OnInit, IObsSelected {
  nbItems: string;
  @Input() itemCollection: SameItemCollection;

  @ViewChild("focusElement", { static: true }) focusElement: ElementRef;

  get debug() {
    let debug = this.itemCollection.items[0] as any;
    let debugInfo = { connections: debug.connections };
    return JSON.stringify(debugInfo);
  }

  get forceTag() {
    if (this.itemCollection.oniItem.zIndex == ZIndex.LiquidConduits)
      return "Liquid";
    else if (this.itemCollection.oniItem.zIndex == ZIndex.GasConduits)
      return "Gas";
    else return undefined;
  }

  getPipeElement() {
    let blueprintItemWire = this.itemCollection.items[0] as BlueprintItemWire;
    if (blueprintItemWire != null && this.showPipeContent)
      return blueprintItemWire.pipeElement;
    else return undefined;
  }

  // TODO boolean in export
  get isGasLiquid() {
    return (
      this.itemCollection.items[0].buildableElements[0].hasTag("Gas") ||
      this.itemCollection.items[0].buildableElements[0].hasTag("Liquid")
    );
  }
  get showPipeContent() {
    return (
      this.itemCollection.oniItem.zIndex == ZIndex.LiquidConduits ||
      this.itemCollection.oniItem.zIndex == ZIndex.GasConduits
    );
  }

  constructor(
    private blueprintService: BlueprintService,
    private toolService: ToolService
  ) {}

  ngOnInit() {
    const numItems = this.itemCollection.items.length;
    this.nbItems = $localize`${numItems} item${
      numItems > 1 ? "s" : ""
    } selected`;
    this.itemCollection.subscribeSelected(this);
  }

  buildingsDestroy() {
    this.toolService.selectTool.buildingsDestroy(this.itemCollection);
  }

  buildingsCopy() {
    this.toolService.changeTool(ToolType.build);

    let newItem = BlueprintHelpers.cloneBlueprintItem(
      this.itemCollection.items[0]
    );

    this.toolService.buildTool.changeItem(newItem);
  }

  selectEvery() {
    this.toolService.selectTool.selectAllLike(this.itemCollection.items[0]);
  }

  selectThisInfo(blueprintItemInfo: BlueprintItemInfo) {
    this.toolService.selectTool.selectThis(blueprintItemInfo);
  }

  selected() {
    this.focusElement.nativeElement.focus();
  }

  changeElement(elementChangeInfo: ElementChangeInfo) {
    // TODO confirm dialog

    this.itemCollection.items.map((item) => {
      item.setElement(elementChangeInfo.newElement.id, elementChangeInfo.index);
    });

    this.itemCollection.updateNbElements();
    this.blueprintService.blueprint.emitBlueprintChanged();
  }

  changePipeElement(element: BuildableElement) {
    this.itemCollection.items.map((item) => {
      let blueprintItemWire = item as BlueprintItemWire;
      if (blueprintItemWire != null) blueprintItemWire.pipeElement = element;
    });

    // TODO Warning message update if not all pipes have the same element
    this.blueprintService.blueprint.emitBlueprintChanged();
  }

  changeTemperature(temperature: number) {
    this.itemCollection.items.map((item) => {
      item.temperature = temperature;
    });

    this.itemCollection.updateTemperatureWarning();
  }
}
