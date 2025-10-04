import { Vector2 } from '../../../../lib';

export class BinLine {
  verticalLineStart: number;
  lineSize: Vector2;
  items: BinItem[];

  constructor(verticalLineStart: number, lineSize: Vector2) {
    this.verticalLineStart = verticalLineStart;
    this.lineSize = lineSize;
    this.items = [];
  }

  tryAddItem(id: string, size: Vector2, bleed: Vector2, trayIndex: number): BinItem | null {
    //console.log(`==> Trying to add to line starting at ${this.verticalLineStart}`);

    let horizontalLineStart = 0;
    for (let item of this.items) horizontalLineStart += item.totalSize!.x;

    horizontalLineStart = Math.ceil(horizontalLineStart);

    let horizontalSpaceRemaining = this.lineSize.x - horizontalLineStart;

    if (size.x + bleed.x * 2 > horizontalSpaceRemaining) {
      //console.log('====> There is not enough horizontal space remaining in this tray');
      //console.log(`====> horizontalSpaceRemaining:${horizontalSpaceRemaining} size.x + bleed.x * 2:${size.x + bleed.x * 2}`);
      return null;
    }

    let itemToAdd = new BinItem();
    itemToAdd.id = id;
    itemToAdd.trayIndex = trayIndex;
    itemToAdd.totalSize = new Vector2(size.x + bleed.x * 2, size.y + bleed.y * 2);
    itemToAdd.uvStart = new Vector2(
      horizontalLineStart + bleed.x,
      this.verticalLineStart + bleed.y
    );
    itemToAdd.uvSize = size;
    //console.log(`====> Creating a new item from ${horizontalLineStart} to ${horizontalLineStart + size.x + bleed.x * 2}`);

    this.items.push(itemToAdd);
    return itemToAdd;
  }
}

export class BinItem {
  id?: string;
  trayIndex?: number;
  totalSize?: Vector2;
  uvStart?: Vector2;
  uvSize?: Vector2;
}
