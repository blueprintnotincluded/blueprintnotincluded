import { SpriteModifier } from './sprite-modifier';
import { SpriteInfo } from './sprite-info';
import { OniItem } from '../oni-item';
import { Vector2 } from '../vector2';
import { Display } from '../enums/display';
import { SpriteTag } from '../enums/sprite-tag';
import { PixiUtil } from './pixi-util';
import { ImageSource } from './image-source';

declare var PIXI: any;

export class DrawPart {
  spriteModifier!: SpriteModifier;
  spriteInfo!: SpriteInfo;
  sprite: any; // PIXI.Sprite | undefined;
  flatIconId: string = '';

  private alpha_: number = 0;
  get alpha() {
    return this.alpha_;
  }
  set alpha(value: number) {
    if (this.sprite != null) this.sprite.alpha = value;
    this.alpha_ = value;
  }
  private tint_: number = 0;
  get tint() {
    return this.tint_;
  }
  set tint(value: number) {
    if (this.sprite != null) this.sprite.tint = value;
    this.tint_ = value;
  }
  private zIndex_: number = 0;
  get zIndex() {
    return this.zIndex_;
  }
  set zIndex(value: number) {
    if (this.sprite != null) this.sprite.zIndex = value;
    this.zIndex_ = value;
  }
  private visible_: boolean = false;
  get visible() {
    return this.visible_;
  }
  set visible(value: boolean) {
    if (this.sprite != null) this.sprite.visible = value;
    this.visible_ = value;
  }

  isReady: boolean;

  public constructor() {
    this.isReady = false;
    this.alpha = 1;
    this.tint = 0xffffff;
  }

  public prepareSprite(container: any /*PIXI.Container*/, oniItem: OniItem, pixiUtil: PixiUtil) {
    if (!this.isReady) {
      if (this.flatIconId) {
        const baseTex = ImageSource.getBaseTexture(this.flatIconId, pixiUtil);
        if (baseTex != null) {
          const texture = pixiUtil.getNewTextureWhole(baseTex);
          this.sprite = pixiUtil.getSpriteFrom(texture);

          const w = oniItem.size.x || 1;
          const h = oniItem.size.y || 1;

          // Bottom-center anchor; same offset as the atlas path so flat icons
          // align with the building's tile footprint.
          this.sprite.anchor.set(0.5, 1.0);
          this.sprite.x = w % 2 === 0 ? 50 : 0;
          this.sprite.y = 50;
          this.sprite.width = w * 100;
          this.sprite.height = h * 100;

          this.sprite.alpha = this.alpha;
          this.sprite.tint = this.tint;
          this.sprite.zIndex = this.zIndex;
          this.sprite.visible = this.visible;

          container.addChild(this.sprite);
          this.isReady = true;
        }
        return;
      }

      if (this.spriteModifier != null)
        this.spriteInfo = SpriteInfo.getSpriteInfo(this.spriteModifier.spriteInfoName);

      let texture: any; // PIXI.Texture;
      if (this.spriteInfo != null) texture = this.spriteInfo.getTexture(pixiUtil);

      if (texture != null) {
        // TODO Invert pivoTY in export
        this.sprite = pixiUtil.getSpriteFrom(texture);

        //if (!this.sprite.texture.baseTexture.valid) console.log('not valid')

        this.sprite.anchor.set(this.spriteInfo.pivot.x, 1 - this.spriteInfo.pivot.y);

        this.sprite.alpha = this.alpha;
        this.sprite.tint = this.tint;
        this.sprite.zIndex = this.zIndex;
        this.sprite.visible = this.visible;

        let tileOffset: Vector2 = new Vector2(oniItem.size.x % 2 == 0 ? 50 : 0, -50);

        // TODO invert translation in export
        this.sprite.x = 0 + (this.spriteModifier.translation.x + tileOffset.x);
        this.sprite.y = 0 - (this.spriteModifier.translation.y + tileOffset.y);

        this.sprite.scale.x = 1;
        this.sprite.scale.y = 1;
        this.sprite.width = this.spriteInfo.realSize.x;
        this.sprite.height = this.spriteInfo.realSize.y;
        this.sprite.scale.x *= this.spriteModifier.scale.x;
        this.sprite.scale.y *= this.spriteModifier.scale.y;

        // TODO invert rotation in export
        this.sprite.angle = -this.spriteModifier.rotation;

        container.addChild(this.sprite);
        this.isReady = true;
      }
    }
  }

  public hasTag(tag: SpriteTag) {
    if (this.flatIconId) return tag === SpriteTag.solid || tag === SpriteTag.place;
    return this.spriteModifier.hasTag(tag);
  }

  prepareVisibilityBasedOnDisplay(newDisplay: Display) {
    if (this.flatIconId) {
      this.visible = true;
      return;
    }

    let tagFilter = newDisplay == Display.blueprint ? SpriteTag.place : SpriteTag.solid;

    if (this.spriteModifier == null) this.visible = false;
    else if (!this.hasTag(tagFilter)) this.visible = false;
    else this.visible = true;
  }

  makeEverythingButThisTagInvisible(tagFilter: SpriteTag) {
    if (this.spriteModifier == null) this.visible = false;
    else if (!this.hasTag(tagFilter)) this.visible = false;
    else this.visible = this.visible && true;
  }

  makeInvisibileIfHasTag(tagFilter: SpriteTag) {
    if (this.hasTag(tagFilter)) this.visible = false;
  }

  makeVisibileIfHasTag(tagFilter: SpriteTag) {
    if (this.hasTag(tagFilter)) this.visible = true;
  }

  public addToContainer(_container: any /*PIXI.Container*/) {
    if (this.spriteModifier != null)
      this.spriteInfo = SpriteInfo.getSpriteInfo(this.spriteModifier.spriteInfoName);
  }
}

export enum DrawPartType {
  Main,
  Solid,
  Left,
  Right,
  Up,
  Down,
}
