import { SpriteModifier } from './sprite-modifier';
import { BSpriteGroup } from '../b-export/b-building';

export class SpriteModifierGroup {
  groupName: string = '';
  spriteModifiers: SpriteModifier[];

  constructor() {
    this.spriteModifiers = [];
  }

  importFrom(original: BSpriteGroup) {
    this.groupName = original.groupName;

    for (let spriteName of original.spriteNames) {
      let spriteModifier = SpriteModifier.getSpriteModifer(spriteName);
      if (spriteModifier != null) this.spriteModifiers.push(spriteModifier);
    }
  }
}
