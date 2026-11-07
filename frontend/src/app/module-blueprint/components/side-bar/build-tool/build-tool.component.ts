import { Component } from "@angular/core";
import { ToolType } from "../../../common/tools/tool";
import {
  BlueprintHelpers,
  BlueprintItem,
  OniItem,
} from "../../../../../../../lib/index";
import {
  ToolService,
  IObsToolChanged,
} from "src/app/module-blueprint/services/tool-service";
import { IObsBuildItemChanged } from "src/app/module-blueprint/common/tools/build-tool";
import { BuildMenuService } from "src/app/module-blueprint/services/build-menu.service";
import { KeybindingService } from "src/app/module-blueprint/services/keybinding.service";
import { ShortcutAction } from "src/app/module-blueprint/keybindings/shortcut-actions";
import { ElementChangeInfo } from "../buildable-element-picker/buildable-element-picker.component";
import { buildingDlcLabels } from "../../build-menu/building-labels";

@Component({
  selector: "app-build-tool",
  templateUrl: "./build-tool.component.html",
  styleUrls: ["./build-tool.component.css"],
  standalone: false,
})
export class ComponentSideBuildToolComponent
  implements IObsBuildItemChanged, IObsToolChanged
{
  currentItem!: OniItem;

  get currentItemToBuild() {
    return this.toolService.buildTool.templateItemToBuild;
  }
  get isGasLiquid() {
    return this.currentItemToBuild.oniItem.isElement;
  }

  constructor(
    public toolService: ToolService,
    private buildMenuService: BuildMenuService,
    private keybindings: KeybindingService,
  ) {
    this.toolService.buildTool.subscribeBuildItemChanged(this);
    this.toolService.subscribeToolChanged(this);
  }

  databaseLoaded: boolean = false;
  oniItemsLoaded() {
    //this.toolService.buildTool.changeItem(BlueprintHelpers.createInstance('SteamTurbine2'));
    // "Tile" is always present in the database, so this is never null.
    this.toolService.buildTool.changeItem(
      BlueprintHelpers.createInstance("Tile")!,
    );
    this.databaseLoaded = true;
  }

  // "Rotate (O)", with whatever key the user has the action on; the button is
  // the touch screen's only way to turn the brush.
  get rotateLabel(): string {
    return this.keybindings.withHint(
      $localize`:build tool button:Rotate`,
      ShortcutAction.buildRotate,
    );
  }

  rotate() {
    this.toolService.buildTool.rotate();
  }

  // The current-item button: the build menu, open on this building's category.
  openBuildMenu() {
    this.buildMenuService.openForItem(this.currentItem?.id);
  }

  // Pack names for the DLC chips under the current item; see buildingDlcLabels.
  dlcLabels(item: OniItem): string[] {
    return buildingDlcLabels(item);
  }

  changeElement(elementChangeInfo: ElementChangeInfo) {
    this.toolService.buildTool.templateItemToBuild.setElement(
      elementChangeInfo.newElement.id,
      elementChangeInfo.index,
    );
  }

  uiItemChanged() {
    // this.currentItem is itself an existing OniItem, so its id is known good.
    this.toolService.buildTool.changeItem(
      BlueprintHelpers.createInstance(this.currentItem.id)!,
    );
  }

  // Re-entering the build tool (pressing "B" again with nothing selected,
  // switching tools and back, ...) must not throw away a brush the user has
  // already configured — only a genuine building-type change (a pick in the
  // build menu) should rebuild from the catalogue default. Guards
  // oniItemsLoaded()'s very first call too, where templateItemToBuild doesn't
  // exist yet.
  private ensureBuildItem() {
    const current = this.toolService.buildTool.templateItemToBuild;
    // A brush the tool switched away from has been destroyed by
    // BuildTool.switchFrom(), which leaves it in the field rather than clearing
    // it. Keeping one because its id still matches hands the render loop a
    // destroyed PIXI container and kills every subsequent frame, so a destroyed
    // brush has to rebuild even when nothing about the item changed -- there is
    // no dialled-in element/temperature left to preserve in a corpse anyway.
    if (
      current != null &&
      !current.destroyed &&
      current.oniItem.id === this.currentItem?.id
    )
      return;
    this.uiItemChanged();
  }

  // IObsBuildItemChanged
  itemChanged(templateItem: BlueprintItem) {
    this.currentItem = templateItem.oniItem;
  }

  // IObsToolChanged
  toolChanged(toolType: ToolType) {
    // If the build tool was just selected, make sure its brush matches
    // currentItem — but don't reset one that's already showing the same item
    // (see ensureBuildItem): pressing "B" to re-enter the tool must keep
    // whatever element/temperature/material the user already dialed in.
    if (toolType == ToolType.build) this.ensureBuildItem();
  }
}
