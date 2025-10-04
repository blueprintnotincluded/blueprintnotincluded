import { BlueprintItem } from './blueprint-item';
import { BlueprintItemWire } from './blueprint-item-wire';
import { BlueprintItemTile } from './blueprint-item-tile';
import { BlueprintItemElement } from './blueprint-item-element';
import { OniItem } from '../oni-item';
import { BlueprintItemInfo } from './blueprint-item-info';

export class BlueprintHelpers {
  static createInstance(id: string): BlueprintItem {
    let newTemplateItem;
    let oniItem = OniItem.getOniItem(id);

    if (oniItem == null) throw new Error('BlueprintHelpers.createInstance : OniItem id not found');

    if (oniItem.isWire) newTemplateItem = new BlueprintItemWire(id);
    else if (oniItem.isTile) newTemplateItem = new BlueprintItemTile(id);
    else if (oniItem.id == OniItem.elementId) newTemplateItem = new BlueprintItemElement(id);
    else if (oniItem.id == OniItem.infoId) newTemplateItem = new BlueprintItemInfo(id);
    else newTemplateItem = new BlueprintItem(id);

    return newTemplateItem;
  }

  static cloneBlueprintItem(
    original: BlueprintItem,
    withConnections: boolean = false,
    withOrientation: boolean = false
  ) {
    let returnValue = BlueprintHelpers.createInstance(original.id);

    let mdbClone = original.toMdbBuilding();
    if (!withConnections) mdbClone.connections = undefined;
    if (!withOrientation) mdbClone.orientation = undefined;

    returnValue.importMdbBuilding(mdbClone);

    return returnValue;
  }
}
