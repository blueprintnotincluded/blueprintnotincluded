import { Vector2 } from '../vector2';
import { BSpriteInfo } from '../b-export/b-sprite-info';
import { DrawHelpers } from './draw-helpers';
import { ImageSource } from './image-source';
import { PixiUtil } from './pixi-util';

export class SpriteInfo {
  public spriteInfoId: string;
  public imageId: string = '';

  // New stuff
  public uvMin: Vector2 = new Vector2();
  public uvSize: Vector2 = new Vector2();
  public realSize: Vector2 = new Vector2();
  public pivot: Vector2 = new Vector2();
  public isIcon: boolean = false;
  public isInputOutput: boolean = false;

  constructor(spriteInfoId: string) {
    this.spriteInfoId = spriteInfoId;
    this.cleanUp();
  }

  public cleanUp() {}

  private static spriteInfosMap: Map<string, SpriteInfo>;

  // Keys is used for some repack stuff
  public static get keys() {
    return Array.from(SpriteInfo.spriteInfosMap.keys());
  }
  public static get spriteInfos() {
    return Array.from(SpriteInfo.spriteInfosMap.values());
  }
  public static init() {
    SpriteInfo.spriteInfosMap = new Map<string, SpriteInfo>();
  }

  public static load(uiSprites: BSpriteInfo[]) {
    for (let uiSprite of uiSprites) {
      let newUiSpriteInfo = new SpriteInfo(uiSprite.name);
      newUiSpriteInfo.copyFrom(uiSprite);

      let imageUrl: string = DrawHelpers.createUrl(newUiSpriteInfo.imageId, false);
      imageUrl = imageUrl.replace('0_solid.png', '0.png');
      ImageSource.AddImagePixi(newUiSpriteInfo.imageId, imageUrl);

      SpriteInfo.addSpriteInfo(newUiSpriteInfo);
    }
  }

  // TODO should this be here?
  public static addSpriteInfoArray(sourceArray: BSpriteInfo[]) {
    for (let sOriginal of sourceArray) {
      let spriteInfo = new SpriteInfo(sOriginal.name);
      spriteInfo.copyFrom(sOriginal);
      SpriteInfo.addSpriteInfo(spriteInfo);
    }
  }

  public static addSpriteInfo(spriteInfo: SpriteInfo) {
    SpriteInfo.spriteInfosMap.set(spriteInfo.spriteInfoId, spriteInfo);
  }

  public copyFrom(original: BSpriteInfo) {
    // TODO refactor
    // DO NOT FORGET : if you add something here, you must add it to the texture repacker also
    let imageUrl: string = DrawHelpers.createUrl(original.textureName, false);
    // TODO FOR REAL find out why these textures are missing from extract
    imageUrl = imageUrl.replace('0_solid.png', '0.png');
    ImageSource.AddImagePixi(original.textureName, imageUrl);
    this.imageId = original.textureName;
    let uvMin = Vector2.clone(original.uvMin);
    if (uvMin == null) uvMin = new Vector2();
    this.uvMin = uvMin;
    let uvSize = Vector2.clone(original.uvSize);
    if (uvSize == null) uvSize = new Vector2();
    this.uvSize = uvSize;
    let realSize = Vector2.clone(original.realSize);
    if (realSize == null) realSize = new Vector2();
    this.realSize = realSize;
    let pivot = Vector2.clone(original.pivot);
    if (pivot == null) pivot = new Vector2();
    this.pivot = pivot;
    this.isIcon = original.isIcon;
    this.isInputOutput = original.isInputOutput;
  }

  public static getSpriteInfo(spriteInfoId: string): SpriteInfo {
    let returnValue = SpriteInfo.spriteInfosMap.get(spriteInfoId);

    if (returnValue != undefined) return returnValue;

    throw new Error('SpriteInfo.getSpriteInfo : Not found');
  }

  // Pixi stuf
  texture: any; // PIXI.Texture;
  public getTexture(pixiUtil: PixiUtil): any {
    // PIXI.Texture
    if (this.texture == null) {
      let baseTex = ImageSource.getBaseTexture(this.imageId, pixiUtil);
      if (baseTex == null) return null;

      let rectangle = pixiUtil.getNewRectangle(
        this.uvMin.x,
        this.uvMin.y,
        this.uvSize.x,
        this.uvSize.y
      );

      this.texture = pixiUtil.getNewTexture(baseTex, rectangle);
    }

    return this.texture;
  }

  public getTextureWithBleed(
    bleed: number,
    realBleed: Vector2 = new Vector2(),
    pixiUtil: PixiUtil
  ): any {
    // PIXI.Texture
    let baseTex = ImageSource.getBaseTexture(this.imageId, pixiUtil);
    if (baseTex == null) return null;

    let rectangle: any = pixiUtil.getNewRectangle(
      this.uvMin.x - bleed,
      this.uvMin.y - bleed,
      this.uvSize.x + bleed * 2,
      this.uvSize.y + bleed * 2
    );

    if (rectangle.x < 0) rectangle.x = 0;
    if (rectangle.y < 0) rectangle.y = 0;
    if (rectangle.x + rectangle.width > baseTex.width)
      rectangle.width = baseTex.width - rectangle.x;
    if (rectangle.y + rectangle.height > baseTex.height)
      rectangle.height = baseTex.height - rectangle.y;

    realBleed.x = this.uvMin.x - rectangle.x;
    realBleed.y = this.uvMin.y - rectangle.y;

    return pixiUtil.getNewTexture(baseTex, rectangle);
  }
}
