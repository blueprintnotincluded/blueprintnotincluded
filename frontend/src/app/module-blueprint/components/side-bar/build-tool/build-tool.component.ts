import { Component, ViewChild, ViewChildren, QueryList } from "@angular/core";
import { ToolType } from "../../../common/tools/tool";
import {
  BlueprintItemElement,
  BlueprintHelpers,
  BlueprintItem,
  OniItem,
  BuildMenuCategory,
  BuildMenuItem,
} from "../../../../../../../lib/index";
import {
  ToolService,
  IObsToolChanged,
} from "src/app/module-blueprint/services/tool-service";
import { IObsBuildItemChanged } from "src/app/module-blueprint/common/tools/build-tool";
import { Popover } from "primeng/popover";
import { ElementChangeInfo } from "../buildable-element-picker/buildable-element-picker.component";
import { BlueprintItemInfo } from "../../../../../../../lib/src/blueprint/blueprint-item-info";

@Component({
  selector: "app-build-tool",
  templateUrl: "./build-tool.component.html",
  styleUrls: ["./build-tool.component.css"],
  standalone: false,
})
export class ComponentSideBuildToolComponent
  implements IObsBuildItemChanged, IObsToolChanged
{
  items: OniItem[][][];

  get buildMenuCategories() {
    return BuildMenuCategory.buildMenuCategories;
  }

  currentCategory!: BuildMenuCategory;
  currentItem!: OniItem;

  get currentItemToBuild() {
    return this.toolService.buildTool.templateItemToBuild;
  }
  get isGasLiquid() {
    return this.currentItemToBuild.oniItem.isElement;
  }

  @ViewChild("categoryPanel") categoryPanel!: Popover;
  @ViewChildren(Popover) itemPanels!: QueryList<Popover>;

  constructor(public toolService: ToolService) {
    this.items = [];
    this.toolService.buildTool.subscribeBuildItemChanged(this);
    this.toolService.subscribeToolChanged(this);
  }

  // TODO the template for the dropdowns fixes the width, whereas the template for the list fixes the height

  databaseLoaded: boolean = false;
  oniItemsLoaded() {
    //this.toolService.buildTool.changeItem(BlueprintHelpers.createInstance('SteamTurbine2'));
    // "Tile" is always present in the database, so this is never null.
    this.toolService.buildTool.changeItem(
      BlueprintHelpers.createInstance("Tile")!,
    );
    this.databaseLoaded = true;
  }

  showCategories(event: any) {
    this.categoryPanel.toggle(event);
    this.itemPanels.forEach((itemPanel) => {
      if (itemPanel != this.itemPanels.last) itemPanel.hide();
    });
  }

  paintElement() {
    const newElement = new BlueprintItemElement(OniItem.elementId);
    newElement.setElement("Water", 0);

    this.toolService.buildTool.changeItem(newElement);

    this.categoryPanel.hide();
  }

  addInfo() {
    const newInfo = new BlueprintItemInfo(OniItem.infoId);
    this.toolService.buildTool.changeItem(newInfo);

    this.categoryPanel.hide();
  }

  showItems(
    event: any,
    buildMenuCategory: BuildMenuCategory,
    indexCategory: number,
  ) {
    this.items[indexCategory] = [];

    let lineIndex = 0;
    let itemIndex = 0;

    for (const buildMenuItem of BuildMenuItem.buildMenuItems)
      if (buildMenuCategory.category == buildMenuItem.category) {
        const oniItem = OniItem.getOniItem(buildMenuItem.buildingId);
        if (this.items[indexCategory][lineIndex] == null)
          this.items[indexCategory].push([]);
        const specialItemName: Record<string, string> = {
          Element: $localize`:special item:Element`,
          Info: $localize`:special item:Info`,
        };
        if (specialItemName[oniItem.id])
          oniItem.name = specialItemName[oniItem.id];
        this.items[indexCategory][lineIndex].push(oniItem);
        itemIndex++;

        if (itemIndex > 6) {
          itemIndex = 0;
          lineIndex++;
        }
      }

    let currentIndex = 0;
    this.itemPanels.forEach((itemPanel) => {
      if (itemPanel != this.itemPanels.last) {
        if (currentIndex != indexCategory) itemPanel.hide();
        else {
          if (this.currentCategory == buildMenuCategory)
            itemPanel.toggle(event);
          else itemPanel.show(event);
        }
      }

      currentIndex++;
    });

    this.currentCategory = buildMenuCategory;
  }

  chooseItem(item: OniItem) {
    this.itemPanels.forEach((itemPanel) => {
      itemPanel.hide();
    });
    this.currentItem = item;
    this.uiItemChanged();
  }

  changeElement(_elementChangeInfo: ElementChangeInfo) {
    this.toolService.buildTool.templateItemToBuild.reloadCamera = true;
    //this.toolService.buildTool.templateItemToBuild.setElement(elementChangeInfo.newElement.id, elementChangeInfo.index);
  }

  uiItemChanged() {
    // this.currentItem is itself an existing OniItem, so its id is known good.
    this.toolService.buildTool.changeItem(
      BlueprintHelpers.createInstance(this.currentItem.id)!,
    );
  }

  onFocus() {
    //this.focusTarget.nativeElement.focus();
  }

  // IObsBuildItemChanged
  itemChanged(templateItem: BlueprintItem) {
    this.currentItem = templateItem.oniItem;
  }

  // IObsToolChanged
  toolChanged(toolType: ToolType) {
    // If the build tool was just selected,
    // We simulate a click to recreate the build tool template item
    if (toolType == ToolType.build) this.uiItemChanged();

    // And we hide all the overlays
    if (this.itemPanels != null)
      this.itemPanels.forEach((itemPanel) => {
        itemPanel.hide();
      });
  }
}
