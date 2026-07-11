import { BlueprintService } from "../../services/blueprint-service";
import {
  BlueprintHelpers,
  BlueprintItem,
  CameraService,
  DrawHelpers,
  OniItem,
  Vector2,
  BuildableElement,
} from "../../../../../../lib/index";
import { Injectable } from "@angular/core";
import { ITool, ToolType } from "./tool";
import { DrawPixi } from "../../drawing/draw-pixi";
import { SameItemCollection } from "./same-item-collection";
import { ToolService } from "src/app/module-blueprint/services/tool-service";

@Injectable()
export class SelectTool implements ITool {
  public sameItemCollections!: SameItemCollection[];

  public observersSelectionChanged: IObsSelectionChanged[] = [];

  parent!: ToolService;

  constructor(private blueprintService: BlueprintService) {
    // TODO also do this on blueprint loading
    this.reset();
  }

  get showTool() {
    return this.sameItemCollections.length > 0;
  }

  reset() {
    this.deselectAll();
    this.sameItemCollections = [];
  }

  public subscribeSelectionChanged(observer: IObsSelectionChanged) {
    this.observersSelectionChanged.push(observer);
  }

  private emitSelectionChanged() {
    this.observersSelectionChanged.map((observer) => {
      observer.selectionChanged();
    });
  }

  private lastSelected!: BlueprintItem;
  private lastSelectedDate!: Date;
  selectFromBox(topLeft: Vector2, bottomRight: Vector2) {
    this.deselectAll();
    this.sameItemCollections = [];

    let tileSelected: Vector2[] = [];

    for (let x = topLeft.x; x <= bottomRight.x; x++)
      for (let y = topLeft.y; y >= bottomRight.y; y--)
        tileSelected.push(new Vector2(x, y));

    if (tileSelected.length > 0) {
      for (let tile of tileSelected) {
        let itemsInTile =
          this.blueprintService.blueprint.getBlueprintItemsAt(tile);
        for (let item of itemsInTile) this.addToCollection(item);
      }

      this.sameItemCollections = this.sameItemCollections.sort((i1, i2) => {
        return i2.items[0].depth - i1.items[0].depth;
      });

      let firstSelected: BlueprintItem | null = null;
      let selectedOne = false;
      this.sameItemCollections.map((itemCollection) => {
        if (
          !selectedOne &&
          itemCollection.items != null &&
          itemCollection.items.length > 0
        ) {
          selectedOne = true;
          firstSelected = itemCollection.items[0];

          let newDate = new Date();
          if (
            firstSelected == this.lastSelected &&
            this.lastSelectedDate != null &&
            newDate.getTime() - this.lastSelectedDate.getTime() < 500
          )
            this.selectAllLike(firstSelected);
          else {
            itemCollection.selected = true;
          }

          this.lastSelected = firstSelected;
          this.lastSelectedDate = newDate;
        }
      });

      if (firstSelected == null) this.currentMultipleSelectionIndex = 0;
    }

    this.emitSelectionChanged();
  }

  selectAll(oniItem: OniItem) {
    this.deselectAll();

    this.blueprintService.blueprint.blueprintItems
      .filter((item) => {
        return item.oniItem == oniItem;
      })
      .map((item) => {
        this.addToCollection(item);
      });

    this.currentMultipleSelectionIndex = 0;

    this.emitSelectionChanged();
  }

  selectAllLike(original: BlueprintItem) {
    this.deselectAll();

    this.blueprintService.blueprint.blueprintItems
      .filter((item) => {
        if (original.oniItem.isElement)
          return (
            original.oniItem == item.oniItem &&
            original.buildableElements[0] == item.buildableElements[0]
          );
        else return original.oniItem == item.oniItem;
      })
      .map((item) => {
        this.addToCollection(item);
      });

    this.currentMultipleSelectionIndex = 0;

    this.emitSelectionChanged();
  }

  selectEveryInfo() {
    this.deselectAll();

    this.blueprintService.blueprint.blueprintItems
      .filter((item) => {
        return item.oniItem.isInfo;
      })
      .map((item) => {
        this.addToCollection(item);
      });

    this.currentMultipleSelectionIndex = 0;

    this.emitSelectionChanged();
  }

  selectThis(original: BlueprintItem) {
    this.deselectAll();

    this.blueprintService.blueprint.blueprintItems
      .filter((item) => {
        return item == original;
      })
      .map((item) => {
        this.addToCollection(item);
      });

    this.currentMultipleSelectionIndex = 0;

    this.emitSelectionChanged();
  }

  selectEveryElement(buildableElement: BuildableElement) {
    this.deselectAll();

    for (let blueprintItem of this.blueprintService.blueprint.blueprintItems)
      if (blueprintItem.buildableElements.indexOf(buildableElement) != -1)
        this.addToCollection(blueprintItem);

    // TODO this does not seem to sort
    this.sameItemCollections = this.sameItemCollections.sort((i1, i2) => {
      return i2.oniItem.zIndex - i1.oniItem.zIndex;
    });

    this.currentMultipleSelectionIndex = 0;

    this.emitSelectionChanged();
  }

  addToCollection(blueprintItem: BlueprintItem) {
    // Find if there is already an item collection for this oniItem
    let itemCollectionArray = this.sameItemCollections.filter((sameItem) => {
      if (blueprintItem.oniItem.isElement)
        return (
          blueprintItem.oniItem.id == sameItem.oniItem.id &&
          blueprintItem.buildableElements[0].id ==
            sameItem.items[0].buildableElements[0].id
        );
      else return blueprintItem.oniItem.id == sameItem.oniItem.id;
    });
    if (itemCollectionArray.length == 0) {
      let newItemCollection = new SameItemCollection(blueprintItem.oniItem);
      newItemCollection.addItem(blueprintItem);

      this.sameItemCollections.push(newItemCollection);
    } else itemCollectionArray[0].addItem(blueprintItem);
  }

  deselectAll() {
    if (this.sameItemCollections != null)
      this.sameItemCollections.map((itemCollection) => {
        itemCollection.selected = false;
      });
    this.sameItemCollections = [];

    this.emitSelectionChanged();
  }

  buildingsDestroy(itemCollection: SameItemCollection) {
    this.blueprintService.blueprint.pauseChangeEvents();
    for (let item of itemCollection.items)
      this.blueprintService.blueprint.destroyBlueprintItem(item);
    this.blueprintService.blueprint.resumeChangeEvents();

    this.sameItemCollections.splice(
      this.sameItemCollections.indexOf(itemCollection),
      1
    );

    this.emitSelectionChanged();
  }

  get currentMultipleSelectionIndex() {
    let activeIndex = -1;

    for (
      let indexSelected = 0;
      indexSelected < this.sameItemCollections.length;
      indexSelected++
    )
      if (this.sameItemCollections[indexSelected].selected)
        activeIndex = indexSelected;

    return activeIndex;
  }

  set currentMultipleSelectionIndex(value: number) {
    for (
      let indexSelected = 0;
      indexSelected < this.sameItemCollections.length;
      indexSelected++
    )
      this.sameItemCollections[indexSelected].selected = value == indexSelected;
  }

  itemGroupeNext() {
    let currentIndex = this.currentMultipleSelectionIndex;

    currentIndex++;
    currentIndex = currentIndex % this.sameItemCollections.length;

    this.currentMultipleSelectionIndex = currentIndex;
  }

  itemGroupePrevious() {
    let currentIndex = this.currentMultipleSelectionIndex;

    // Special case : if nothing is currently selected, we want the next selection to be 0;
    if (currentIndex == -1) currentIndex = 1;

    currentIndex--;
    if (currentIndex < 0) currentIndex += this.sameItemCollections.length;

    this.currentMultipleSelectionIndex = currentIndex;
  }

  destroyAll() {
    if (this.sameItemCollections != null) {
      this.blueprintService.blueprint.pauseChangeEvents();

      for (let itemCollection of this.sameItemCollections)
        itemCollection.destroyAll();

      this.blueprintService.blueprint.resumeChangeEvents();
    }

    this.deselectAll();
  }

  // Tool interface :
  switchFrom() {
    this.deselectAll();
  }

  switchTo() {
    this.deselectAll();
  }

  mouseOut() {}

  mouseDown(_tile: Vector2) {}

  leftClick(tile: Vector2) {
    let doSelectFromBox = true;

    if (this.currentMultipleSelectionIndex != -1) {
      let next_group =
        (this.currentMultipleSelectionIndex + 1) %
        this.sameItemCollections.length;
      doSelectFromBox =
        this.sameItemCollections[next_group].items.find((item) =>
          item.position.equals(tile)
        ) === undefined;
    }

    if (doSelectFromBox) {
      this.selectFromBox(tile, tile);
    } else {
      this.itemGroupeNext();
    }
  }

  rightClick(_tile: Vector2) {
    this.deselectAll();
  }

  hover(_tile: Vector2) {}

  beginSelection: Vector2 | null = null;
  endSelection!: Vector2;
  drag(tileStart: Vector2, tileStop: Vector2) {
    if (this.beginSelection == null)
      this.beginSelection = Vector2.clone(tileStart)!;
    this.endSelection = Vector2.clone(tileStop)!;
  }

  dragStop() {
    if (this.beginSelection != null && this.endSelection != null) {
      let beginTile = DrawHelpers.getIntegerTile(this.beginSelection);
      let endTile = DrawHelpers.getIntegerTile(this.endSelection);

      let topLeft = new Vector2(
        Math.min(beginTile.x, endTile.x),
        Math.max(beginTile.y, endTile.y)
      );

      let bottomRight = new Vector2(
        Math.max(beginTile.x, endTile.x),
        Math.min(beginTile.y, endTile.y)
      );

      this.selectFromBox(topLeft, bottomRight);
    }

    this.beginSelection = null; // Vector2 | null
  }

  keyDown(keyCode: string) {
    if (keyCode == "Delete") {
      let itemGroupToDestroyIndex = this.currentMultipleSelectionIndex;
      if (itemGroupToDestroyIndex != -1)
        this.buildingsDestroy(
          this.sameItemCollections[itemGroupToDestroyIndex]
        );
    } else if (keyCode == "b") {
      // ignore keypress when a textbox is active
      let textboxElements = ["INPUT", "TEXTAREA"];
      let activeElement = document.activeElement?.tagName ?? "";
      if (textboxElements.includes(activeElement)) {
        return;
      }

      // find the currently selected item
      let newItem = null;
      let itemGroupToDestroyIndex = this.currentMultipleSelectionIndex;
      if (itemGroupToDestroyIndex != -1) {
        newItem = BlueprintHelpers.cloneBlueprintItem(
          this.sameItemCollections[itemGroupToDestroyIndex].items[0]
        );
      }

      // change tool
      this.parent.changeTool(ToolType.build);
      if (newItem != null) {
        this.parent.buildTool.changeItem(newItem);
      }
    }
  }

  draw(drawPixi: DrawPixi, camera: CameraService) {
    // Return
    if (this.beginSelection == null) return;

    // Snap to the same whole tiles selectFromBox() will actually operate on
    // (see dragStop()), so the drawn box previews the real selection instead
    // of following the raw cursor position.
    let beginTile = DrawHelpers.getIntegerTile(this.beginSelection);
    let endTile = DrawHelpers.getIntegerTile(this.endSelection);

    let topLeft = new Vector2(
      Math.min(beginTile.x, endTile.x),
      Math.max(beginTile.y, endTile.y)
    );

    let bottomRight = new Vector2(
      Math.max(beginTile.x, endTile.x) + 1,
      Math.min(beginTile.y, endTile.y) - 1
    );

    drawPixi.drawTileRectangle(
      camera,
      topLeft,
      bottomRight,
      true,
      2,
      0x4cff00,
      0x2d9600,
      0.25,
      0.8
    );
  }

  toggleable: boolean = false;
  visible: boolean = false;
  captureInput: boolean = true;
  toolType = ToolType.select;
  toolGroup: number = 1;
}

export interface IObsSelectionChanged {
  selectionChanged(): void;
}
