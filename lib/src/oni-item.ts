import { Orientation } from './enums/orientation';
import { Vector2 } from './vector2';
import { UtilityConnection, ConnectionHelper } from './utility-connection';
import { BuildableElement } from './b-export/b-element';
import { BUiScreen } from './b-export/b-ui-screen';
import { SpriteModifierGroup } from './drawing/sprite-modifier-group';
import { PermittedRotations } from './enums/permitted-rotations';
import { ZIndex } from './enums/z-index';
import { Overlay } from './enums/overlay';
import { BBuilding } from './b-export/b-building';
import { StringHelpers } from './string-helpers';
import { SpriteModifier } from './drawing/sprite-modifier';
import { BuildMenuItem, BuildMenuCategory } from './b-export/b-build-order';
import { BuildLocationRule } from './enums/build-location-rule';
import { ConnectionType } from './enums/connection-type';

export class OniItem {
  static elementId = 'Element';
  static infoId = 'Info';
  static defaultColor = '#696969';

  id: string;
  name: string = '';

  // imageId here is used for some stuff (generating white background textures)
  imageId: string = '';
  iconUrl: string = '';
  spriteModifierId: string = '';
  isWire: boolean = false;
  isTile: boolean = false;
  isBridge: boolean = false;
  // TODO this should be a get like isInfo
  isElement: boolean = false;
  get isInfo(): boolean {
    return this.id == OniItem.infoId;
  }
  size: Vector2 = new Vector2();
  tileOffset: Vector2 = new Vector2();
  utilityConnections: UtilityConnection[] = [];
  backColor: number = 0x000000;
  frontColor: number = 0xffffff;
  orientations: Orientation[] = [];
  dragBuild: boolean = false;
  objectLayer: number = 0; // TODO import enum?
  buildableElementsArray: BuildableElement[][] = [];
  defaultElement: BuildableElement[] = [];
  materialMass: number[] = [0];
  uiScreens: BUiScreen[] = [];
  spriteGroup: SpriteModifierGroup = new SpriteModifierGroup();

  tileableLeftRight: boolean = false;
  tileableTopBottom: boolean = false;

  get isPartOfCircuit(): boolean {
    for (let utility of this.utilityConnections)
      if (utility.type == ConnectionType.POWER_INPUT || utility.type == ConnectionType.POWER_OUTPUT)
        return true;

    if (this.zIndex == ZIndex.Wires) return true;

    return false;
  }

  private permittedRotations_: PermittedRotations = PermittedRotations.Unrotatable;
  get permittedRotations() {
    return this.permittedRotations_;
  }
  set permittedRotations(value: PermittedRotations) {
    this.permittedRotations_ = value;

    if (value == PermittedRotations.Unrotatable) this.orientations = [Orientation.Neutral];
    else if (value == PermittedRotations.FlipH)
      this.orientations = [Orientation.Neutral, Orientation.FlipH];
    else if (value == PermittedRotations.FlipV)
      this.orientations = [Orientation.Neutral, Orientation.FlipV];
    else if (value == PermittedRotations.R90)
      this.orientations = [Orientation.Neutral, Orientation.R90];
    else if (value == PermittedRotations.R360)
      this.orientations = [
        Orientation.Neutral,
        Orientation.R90,
        Orientation.R180,
        Orientation.R270,
      ];
  }

  buildLocationRule: BuildLocationRule = BuildLocationRule.Anywhere;

  // Overlay
  zIndex: ZIndex = ZIndex.Building;
  overlay: Overlay = Overlay.Base;

  constructor(id: string) {
    this.id = id;
    this.cleanUp();
  }

  public copyFrom(original: BBuilding) {
    this.id = original.prefabId;
    this.name = original.name;
    this.size = original.sizeInCells;
    this.isWire = original.isUtility;
    this.isBridge = original.isBridge;
    this.isTile = original.isTile;

    this.spriteModifierId = original.kanimPrefix;
    this.iconUrl = StringHelpers.createUrl(original.kanimPrefix + 'ui_0', true);
    this.zIndex = original.sceneLayer;
    this.overlay = this.getRealOverlay(original.viewMode);
    this.backColor = original.backColor;
    this.frontColor = original.frontColor;

    this.dragBuild = original.dragBuild;
    this.objectLayer = original.objectLayer;
    this.permittedRotations = original.permittedRotations;

    this.tileableLeftRight = original.tileableLeftRight;
    this.tileableTopBottom = original.tileableTopBottom;
    this.buildLocationRule = original.buildLocationRule;

    // TODO not sure if this is usefull still
    let imageId: string = original.textureName;
    let imageUrl: string = StringHelpers.createUrl(imageId, false);
    //ImageSource.AddImagePixi(imageId, imageUrl);

    this.buildableElementsArray = BuildableElement.getElementsFromTags(original.materialCategory);
    this.defaultElement = [];
    for (
      let indexElements = 0;
      indexElements < this.buildableElementsArray.length;
      indexElements++
    ) {
      let buildableElement = this.buildableElementsArray[indexElements];
      if (buildableElement.length > 0) this.defaultElement[indexElements] = buildableElement[0];
      else this.defaultElement[indexElements] = BuildableElement.getElement('Unobtanium');
    }

    this.materialMass = [];
    for (let mass of original.materialMass) this.materialMass.push(mass);

    this.uiScreens = [];
    for (let uiScreen of original.uiScreens) this.uiScreens.push(BUiScreen.clone(uiScreen));

    this.spriteGroup = new SpriteModifierGroup();
    this.spriteGroup.importFrom(original.sprites);
    /*
    for (let spriteGroup of original.sprites) {
      let newGroup = SpriteModifierGroup.copyFrom(spriteGroup);
      this.spriteGroups.set(newGroup.groupName, newGroup);
    }
    */

    this.imageId = imageId;

    this.utilityConnections = [];
    if (original.utilities != null)
      for (let connection of original.utilities)
        this.utilityConnections.push({
          type: connection.type,
          offset: connection.offset && new Vector2(connection.offset.x, connection.offset.y),
          isSecondary: connection.isSecondary,
        });
  }

  public getRealOverlay(overlay: Overlay) {
    let returnValue: Overlay = overlay;

    switch (overlay) {
      case Overlay.Decor:
      case Overlay.Light:
      case Overlay.Oxygen:
      case Overlay.Room:
      case Overlay.Temperature:
      case Overlay.Unknown:
        returnValue = Overlay.Base;
    }

    return returnValue;
  }

  public cleanUp() {
    if (this.isTile == null) this.isTile = false;
    if (this.isWire == null) this.isWire = false;
    if (this.isBridge == null) this.isBridge = false;
    if (this.isElement == null) this.isElement = false;
    if (this.size == null) this.size = new Vector2();
    if (this.utilityConnections == null) this.utilityConnections = [];
    if (this.zIndex == null) this.zIndex = ZIndex.Building;
    if (this.permittedRotations == null) this.permittedRotations = PermittedRotations.Unrotatable;
    if (this.backColor == null) this.backColor = 0x000000;
    if (this.frontColor == null) this.frontColor = 0xffffff;
    if (this.buildableElementsArray == null || this.buildableElementsArray.length == 0)
      this.buildableElementsArray = [[BuildableElement.getElement('Vacuum')]];
    if (this.materialMass == null) this.materialMass = [0];
    if (this.uiScreens == null) this.uiScreens = [];
    if (this.spriteGroup == null) this.spriteGroup = new SpriteModifierGroup();
    if (this.tileableLeftRight == null) this.tileableLeftRight = false;
    if (this.tileableTopBottom == null) this.tileableTopBottom = false;
    if (this.defaultElement == null || this.defaultElement.length == 0)
      this.defaultElement = [BuildableElement.getElement('Vacuum')];
    if (this.overlay == null) this.overlay = Overlay.Base;
    if (this.buildLocationRule == null) this.buildLocationRule = BuildLocationRule.Anywhere;

    if (Vector2.Zero.equals(this.size)) this.tileOffset = Vector2.Zero;
    else {
      this.tileOffset = new Vector2(1 - (this.size.x + (this.size.x % 2)) / 2, 0);
    }
  }

  public static oniItemsMap: Map<string, OniItem>;
  public static get oniItems() {
    return Array.from(OniItem.oniItemsMap.values());
  }
  public static init() {
    OniItem.oniItemsMap = new Map<string, OniItem>();
  }

  public static load(buildings: BBuilding[]) {
    for (let building of buildings) {
      let oniItem = new OniItem(building.prefabId);
      oniItem.copyFrom(building);
      oniItem.cleanUp();

      // If the building is a tile, we need to generate its spriteInfos and sprite modifiers
      if (oniItem.isTile) {
        //SpriteInfo.addSpriteInfoArray(DrawHelpers.generateTileSpriteInfo(building.kanimPrefix, building.textureName));
        //SpriteModifier.addTileSpriteModifier(building.kanimPrefix);
      }

      SpriteModifier.AddSpriteModifier(building);

      OniItem.oniItemsMap.set(oniItem.id, oniItem);
    }

    let elementOniItem = new OniItem(OniItem.elementId);
    elementOniItem.name = OniItem.elementId;
    elementOniItem.isElement = true;
    elementOniItem.zIndex = ZIndex.GasFront;
    elementOniItem.spriteGroup = new SpriteModifierGroup();
    elementOniItem.spriteGroup.spriteModifiers.push(
      SpriteModifier.getSpriteModifer('element_tile_back')
    );
    elementOniItem.spriteGroup.spriteModifiers.push(
      SpriteModifier.getSpriteModifer('gas_tile_front')
    );
    elementOniItem.spriteGroup.spriteModifiers.push(
      SpriteModifier.getSpriteModifer('liquid_tile_front')
    );
    elementOniItem.spriteGroup.spriteModifiers.push(
      SpriteModifier.getSpriteModifer('vacuum_tile_front')
    );
    elementOniItem.cleanUp();
    OniItem.oniItemsMap.set(elementOniItem.id, elementOniItem);

    let infoOniItem = new OniItem(OniItem.infoId);
    infoOniItem.name = OniItem.infoId;
    infoOniItem.iconUrl = 'assets/images/ui/manual/info-indicator-icon.png';
    infoOniItem.zIndex = ZIndex.BuildingUse;
    infoOniItem.spriteGroup = new SpriteModifierGroup();
    infoOniItem.spriteGroup.spriteModifiers.push(SpriteModifier.getSpriteModifer('info_back'));
    for (let i = 0; i < 12; i++)
      infoOniItem.spriteGroup.spriteModifiers.push(
        SpriteModifier.getSpriteModifer('info_front_' + i)
      );
    infoOniItem.cleanUp();
    OniItem.oniItemsMap.set(infoOniItem.id, infoOniItem);
  }

  public isOverlayPrimary(overlay: Overlay): boolean {
    return overlay == ConnectionHelper.getOverlayFromLayer(this.zIndex);
  }

  public isOverlaySecondary(overlay: Overlay): boolean {
    return overlay == this.overlay;
  }

  public getCategoryFromItem(): BuildMenuCategory {
    if (BuildMenuItem.buildMenuItems != null)
      for (let buildMenuItem of BuildMenuItem.buildMenuItems)
        if (buildMenuItem.buildingId == this.id)
          return BuildMenuCategory.getCategory(buildMenuItem.category);

    throw new Error('OniItem.getCategoryFromItem : Building not found');
  }

  public static getOniItem(id: string): OniItem {
    let returnValue = OniItem.oniItemsMap.get(id);
    /*
    if (returnValue == null)
    {
      returnValue = new OniItem(id);
      returnValue.cleanUp();
    }
*/
    if (returnValue != undefined) return returnValue;
    else throw new Error('OniItem.getOniItem : OniItem id not found : ' + id);
  }
}
