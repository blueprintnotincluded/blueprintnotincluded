import { BSpriteInfo } from './b-sprite-info';
import { BSpriteModifier } from './b-sprite-modifier';
import { UtilityConnection } from '../utility-connection';
import { Overlay } from '../enums/overlay';
import { PermittedRotations } from '../enums/permitted-rotations';
import { BUiScreen } from '../b-export/b-ui-screen';
import { Vector2 } from '../vector2';
import { ZIndex } from '../enums/z-index';
import { BuildLocationRule } from '../enums/build-location-rule';

// A building (exported from the game)
export class BBuilding {
  name: string = '';
  prefabId: string = '';
  isTile: boolean = false;
  isUtility: boolean = false;
  isBridge: boolean = false;
  sizeInCells: Vector2 = new Vector2();
  sceneLayer: ZIndex = ZIndex.Building;
  viewMode: Overlay = Overlay.Base;
  backColor: number = 0;
  frontColor: number = 0;

  kanimPrefix: string = '';
  textureName: string = '';

  spriteInfos: BSpriteInfo[] = [];
  spriteModifiers: BSpriteModifier[] = [];
  utilities: UtilityConnection[] = [];
  materialCategory: string[] = [];
  materialMass: number[] = [];
  uiScreens: BUiScreen[] = [];
  sprites: BSpriteGroup = new BSpriteGroup('default');

  dragBuild: boolean = false;
  objectLayer: number = 0;
  permittedRotations: PermittedRotations = PermittedRotations.Unrotatable;
  buildLocationRule: BuildLocationRule = BuildLocationRule.Anywhere;

  tileableLeftRight: boolean = false;
  tileableTopBottom: boolean = false;
}

// All sprites for a building
// TODO since all sprites for a building are inside the same group, we don't need this class anymore. spriteNames should go directly into the BBuilding class
export class BSpriteGroup {
  groupName: string;
  spriteNames: string[] = [];

  constructor(groupName: string) {
    this.groupName = groupName;
  }

  static clone(original: BSpriteGroup) {
    let returnValue = new BSpriteGroup(original.groupName);

    returnValue.spriteNames = [];
    for (let spriteName of original.spriteNames) returnValue.spriteNames.push(spriteName);

    return returnValue;
  }
}
