import { PixiUtil } from './pixi-util';

export class ImageSource {
  imageId: string;
  imageUrl: string;

  constructor(imageId: string, imageUrl: string) {
    this.imageId = imageId;
    this.imageUrl = imageUrl;
  }

  // PIXI stuff
  private static imageSourcesMapPixi: Map<string, ImageSource>;
  public static get keys() {
    return Array.from(ImageSource.imageSourcesMapPixi.keys());
  }
  private baseTexture: any; // PIXI.BaseTexture | undefined;
  public static init() {
    ImageSource.imageSourcesMapPixi = new Map<string, ImageSource>();
  }

  public static AddImagePixi(imageId: string, imageUrl: string) {
    let newImageSource = new ImageSource(imageId, imageUrl);
    ImageSource.imageSourcesMapPixi.set(newImageSource.imageId, newImageSource);
  }

  public static isTextureLoaded(imageId: string): boolean {
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);

    if (imageSource == null) return false;

    return imageSource.baseTexture != null;
  }

  public static getBaseTexture(imageId: string, pixiUtil: PixiUtil): any {
    // PIXI.BaseTexture | undefined
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);

    if (imageSource == null) return undefined;

    if (imageSource.baseTexture == null) {
      imageSource.baseTexture = pixiUtil.getNewBaseTexture(imageSource.imageUrl);
    }

    return imageSource.baseTexture;
  }

  public static setBaseTexture(imageId: string, baseTexture: any /*PIXI.BaseTexture*/) {
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);

    if (imageSource == null) return;

    if (imageSource.baseTexture == null) {
      imageSource.baseTexture = baseTexture;
      // Any whole-image texture cached below belongs to the previous base.
      imageSource.wholeTexture = undefined;
    }
  }

  // The whole-image Texture for this source, created once.
  private wholeTexture: any; // PIXI.Texture | undefined;

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
  public static getWholeTexture(imageId: string, pixiUtil: PixiUtil): any {
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);

    if (imageSource == null) return undefined;

    if (imageSource.wholeTexture == null) {
      let baseTexture = ImageSource.getBaseTexture(imageId, pixiUtil);
      if (baseTexture == null) return undefined;
      imageSource.wholeTexture = pixiUtil.getNewTextureWhole(baseTexture);
    }

    return imageSource.wholeTexture;
  }

  public static getUrl(imageId: string) {
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);
    if (imageSource == null) throw new Error('ImageSource.getUrl : imageId not found : ' + imageId);
    return imageSource.imageUrl;
  }

  public static setUrl(imageId: string, imageUrl: string) {
    let imageSource: ImageSource | undefined = ImageSource.imageSourcesMapPixi.get(imageId);

    if (imageSource != null) imageSource.imageUrl = imageUrl;
  }
}
