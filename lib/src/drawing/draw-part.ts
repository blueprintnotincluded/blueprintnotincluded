import { SpriteModifier } from './sprite-modifier';
import { SpriteInfo } from './sprite-info';
import { OniItem } from '../oni-item';
import { Vector2 } from '../vector2';
import { Display } from '../enums/display';
import { SpriteTag } from '../enums/sprite-tag';
import { PixiUtil } from './pixi-util';

declare var PIXI: any;

export class DrawPart {
  spriteModifier!: SpriteModifier;
  spriteInfo!: SpriteInfo;
  sprite: any; // PIXI.Sprite | undefined;

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
    return this.spriteModifier.hasTag(tag);
  }

  prepareVisibilityBasedOnDisplay(newDisplay: Display) {
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

  public addToContainer(container: any /*PIXI.Container*/) {
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
