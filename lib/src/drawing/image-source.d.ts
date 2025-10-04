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
    static getUrl(imageId: string): string;
    static setUrl(imageId: string, imageUrl: string): void;
}
//# sourceMappingURL=image-source.d.ts.map