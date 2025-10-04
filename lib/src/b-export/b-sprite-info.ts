import { Vector2 } from '../vector2';

export class BSpriteInfo {
  name: string = '';
  textureName: string = '';
  isIcon: boolean = false;
  isInputOutput: boolean = false;

  uvMin: Vector2 = new Vector2();
  uvSize: Vector2 = new Vector2();
  realSize: Vector2 = new Vector2();
  pivot: Vector2 = new Vector2();

  // Used when repacking textures
  static clone(source: BSpriteInfo): BSpriteInfo {
    let returnValue: BSpriteInfo = new BSpriteInfo();

    returnValue.name = source.name;
    returnValue.textureName = source.textureName;
    returnValue.isIcon = source.isIcon;
    returnValue.isInputOutput = source.isInputOutput;

    returnValue.uvMin = Vector2.cloneNullToZero(source.uvMin);
    returnValue.uvSize = Vector2.cloneNullToZero(source.uvSize);
    returnValue.realSize = Vector2.cloneNullToZero(source.realSize);
    returnValue.pivot = Vector2.cloneNullToZero(source.pivot);

    return returnValue;
  }
}
