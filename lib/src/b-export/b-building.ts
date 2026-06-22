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
  uiImage: string = '';

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

  // True when the export ships per-connection-state sprites for this building
  // (assets/connection_sprites/<prefabId>/{0..15}.png). Derived from dir presence
  // by the 2024 converter — the export omits tileableLeftRight/tileableTopBottom.
  connectionSprites: boolean = false;

  // Canvas-to-cell scale for connection sprites (canvas px / cell px, per axis),
  // measured per building by the converter from the all-connected (state 15) PNG.
  // The PNGs frame one tile plus cap/overhang (tiles ~1.5x, utilities ~1.05-1.15x,
  // RocketEnvelopeWindowTile 1.0x), so the renderer scales by this and center-anchors
  // to make the cell map to one tile and tile flush. {1,1} for non-connectables.
  connectionScale: Vector2 = new Vector2(1, 1);

  // OPTIONAL placement of the flat ui_image relative to the footprint, in cell units
  // (see BBuildingDef2024.uiImageRect). When present the renderer draws the icon at this
  // rectangle (allowing overhang) instead of stretching it to fill the footprint box.
  uiImageRect?: { x: number; y: number; w: number; h: number };
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
