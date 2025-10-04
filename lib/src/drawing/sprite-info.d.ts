import { Vector2 } from '../vector2';
import { BSpriteInfo } from '../b-export/b-sprite-info';
import { PixiUtil } from './pixi-util';
export declare class SpriteInfo {
    spriteInfoId: string;
    imageId: string;
    uvMin: Vector2;
    uvSize: Vector2;
    realSize: Vector2;
    pivot: Vector2;
    isIcon: boolean;
    isInputOutput: boolean;
    constructor(spriteInfoId: string);
    cleanUp(): void;
    private static spriteInfosMap;
    static get keys(): string[];
    static get spriteInfos(): SpriteInfo[];
    static init(): void;
    static load(uiSprites: BSpriteInfo[]): void;
    static addSpriteInfoArray(sourceArray: BSpriteInfo[]): void;
    static addSpriteInfo(spriteInfo: SpriteInfo): void;
    copyFrom(original: BSpriteInfo): void;
    static getSpriteInfo(spriteInfoId: string): SpriteInfo;
    texture: any;
    getTexture(pixiUtil: PixiUtil): any;
    getTextureWithBleed(bleed: number, realBleed: Vector2 | undefined, pixiUtil: PixiUtil): any;
}
//# sourceMappingURL=sprite-info.d.ts.map