import { SpriteModifier } from './sprite-modifier';
import { SpriteInfo } from './sprite-info';
import { OniItem } from '../oni-item';
import { Display } from '../enums/display';
import { SpriteTag } from '../enums/sprite-tag';
import { PixiUtil } from './pixi-util';
export declare class DrawPart {
    spriteModifier: SpriteModifier;
    spriteInfo: SpriteInfo;
    sprite: any;
    private alpha_;
    get alpha(): number;
    set alpha(value: number);
    private tint_;
    get tint(): number;
    set tint(value: number);
    private zIndex_;
    get zIndex(): number;
    set zIndex(value: number);
    private visible_;
    get visible(): boolean;
    set visible(value: boolean);
    isReady: boolean;
    constructor();
    prepareSprite(container: any, oniItem: OniItem, pixiUtil: PixiUtil): void;
    hasTag(tag: SpriteTag): boolean;
    prepareVisibilityBasedOnDisplay(newDisplay: Display): void;
    makeEverythingButThisTagInvisible(tagFilter: SpriteTag): void;
    makeInvisibileIfHasTag(tagFilter: SpriteTag): void;
    makeVisibileIfHasTag(tagFilter: SpriteTag): void;
    addToContainer(container: any): void;
}
export declare enum DrawPartType {
    Main = 0,
    Solid = 1,
    Left = 2,
    Right = 3,
    Up = 4,
    Down = 5
}
//# sourceMappingURL=draw-part.d.ts.map