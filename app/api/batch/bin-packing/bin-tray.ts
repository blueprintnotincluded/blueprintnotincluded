import { BinLine, BinItem } from './bin-line';
import { Vector2 } from '../../../../lib';

export class BinTray {
  trayIndex: number;
  binSize: Vector2;
  binLines: BinLine[];

  constructor(binSize: Vector2, trayIndex: number) {
    this.binSize = binSize;
    this.trayIndex = trayIndex;
    this.binLines = [];
  }

  tryAddItem(id: string, size: Vector2, bleed: Vector2): BinItem | null {
    //console.log('Trying to add into tray ' + this.trayIndex);

    // First we try to add the item to the existing lines
    for (let line of this.binLines) {
      let itemAdded = line.tryAddItem(id, size, bleed, this.trayIndex);
      if (itemAdded != null) return itemAdded;
    }

    // If the item was not added
    let verticalLineStart = 0;
    for (let line of this.binLines) verticalLineStart += line.lineSize.y;

    verticalLineStart = Math.ceil(verticalLineStart);
    let verticalSpaceRemaining = this.binSize.y - verticalLineStart;

    if (size.y + 2 * bleed.y > verticalSpaceRemaining) {
      //console.log('==> There is not enough vertical space remaining in this tray');
      //console.log(`==> verticalSpaceRemaining:${verticalSpaceRemaining} size.y + 2 * bleed.y:${size.y + 2 * bleed.y}`);
      return null;
    } else {
      //console.log(`==> Creating a new line from ${verticalLineStart} to ${verticalLineStart + size.y + 2 * bleed.y}`);
      let newLine = new BinLine(
        verticalLineStart,
        new Vector2(this.binSize.x, size.y + 2 * bleed.y)
      );
      this.binLines.push(newLine);
      let itemAdded = newLine.tryAddItem(id, size, bleed, this.trayIndex);
      if (itemAdded != null) return itemAdded;
    }

    return null;
  }
}
