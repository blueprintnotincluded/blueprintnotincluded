import { PixiUtil } from './pixi-util';
export declare class ImageSource {
    imageId: string;
    imageUrl: string;
    constructor(imageId: string, imageUrl: string);
    private static imageSourcesMapPixi;
    static get keys(): string[];
    private baseTexture;
    static init(): void;
    static AddImagePixi(imageId: string, imageUrl: string): void;
    static isTextureLoaded(imageId: string): boolean;
    static getBaseTexture(imageId: string, pixiUtil: PixiUtil): any;
    static setBaseTexture(imageId: string, baseTexture: any): void;
    private wholeTexture;
    /**
     * A Texture covering the entire image, shared by every sprite that draws it.
     *
     * Callers used to build their own with `new Texture(baseTexture)` per draw
     * part. That leaks: a PIXI v5 Texture subscribes to its BaseTexture's
     * 'loaded' and 'update' events in its constructor, so the BaseTexture — which
     * is cached here for the life of the process — holds a reference to every
     * Texture ever made from it. Nothing the sprite or its container does can
     * release them. A server-side render of an 8,612-item blueprint created
     * 99,794 of them and retained ~77MB after the render finished, per render,
     * until the process died.
     *
     * Sharing one Texture is safe because nothing per-sprite lives on it:
     * anchor, position, size and tint are all Sprite state. This mirrors
     * SpriteInfo.getTexture, which has always memoized its atlas texture.
     */
    static getWholeTexture(imageId: string, pixiUtil: PixiUtil): any;
    static getUrl(imageId: string): string;
    static setUrl(imageId: string, imageUrl: string): void;
}
//# sourceMappingURL=image-source.d.ts.map