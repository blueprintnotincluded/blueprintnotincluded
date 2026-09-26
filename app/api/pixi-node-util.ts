const { loadImage, createCanvas } = require('canvas');
const PIXI = require('../pixi-shim');
require('../pixi-shim/lib/pixi-shim-node.js');

import { Jimp, intToRGBA } from 'jimp';
import {
  PixiUtil,
  ImageSource,
  Blueprint,
  Vector2,
  CameraService,
  Overlay,
  Display,
} from '../../lib';
import { resources } from 'pixi.js-legacy';

class NodeCanvasResource extends resources.BaseImageResource {
  constructor(source: any) {
    super(source);
  }
}

export class PixiNodeUtil implements PixiUtil {
  pixiApp: PIXI.Application;
  pixiGraphicsBack: PIXI.Graphics;
  pixiGraphicsFront: PIXI.Graphics;

  constructor(options: any) {
    this.pixiApp = new PIXI.Application(options);
    this.pixiGraphicsFront = this.getNewGraphics();
    this.pixiGraphicsBack = this.getNewGraphics();
  }

  getNewPixiApp(_options: any) {
    return this.pixiApp;
    //return new PIXI.Application(options);
  }
  getNewBaseRenderTexture(options: any) {
    return new PIXI.BaseRenderTexture(options);
  }
  getNewRenderTexture(brt: any) {
    return new PIXI.RenderTexture(brt);
  }
  getNewGraphics() {
    return new PIXI.Graphics();
  }
  getNewContainer() {
    return new PIXI.Container();
  }
  getSpriteFrom(ressource: any) {
    return PIXI.Sprite.from(ressource);
  }
  getNewBaseTexture(_url: string) {
    throw new Error('This should not be called on node : all textures should be preloaded');
  }
  getNewTexture(baseTex: any, rectangle: any) {
    return new PIXI.Texture(baseTex, rectangle);
  }

  public getNewTextureWhole(baseTex: PIXI.BaseTexture) {
    return new PIXI.Texture(baseTex);
  }

  getNewRectangle(x1: number, y1: number, x2: number, y2: number) {
    return new PIXI.Rectangle(x1, y1, x2, y2);
  }

  getUtilityGraphicsBack(): any {
    return this.pixiGraphicsBack;
  }

  getUtilityGraphicsFront(): any {
    return this.pixiGraphicsFront;
  }

  async initTextures() {
    for (let k of ImageSource.keys) {
      let imageUrl = ImageSource.getUrl(k)!;
      let brt = await this.getImageFromCanvas(imageUrl);
      ImageSource.setBaseTexture(k, brt);
    }
  }

  /**
   * Decode an image into a BaseTexture, optionally capping its longest side.
   *
   * The cap exists because the building art is authored at print resolution --
   * assets/ui_image is 1,369 icons totalling ~419MB of RGBA at native size, up
   * to 1524x1263 -- while a preview draws a building into a few tens of
   * pixels. The full-size bitmap is still decoded here, since libpng gives no
   * way to scale while decoding, but it is transient: only the downscaled
   * canvas is retained.
   *
   * Only safe for textures drawn whole. An atlas must never be capped: its
   * sprites are addressed by pixel rectangles (SpriteInfo.uvMin/uvSize), which
   * scaling silently invalidates.
   */
  async getImageFromCanvas(path: string, maxDimension?: number) {
    const image = await loadImage(path);
    let source: any = image;
    const nativeMax = Math.max(image.width, image.height);
    if (maxDimension != null && nativeMax > maxDimension) {
      const scale = maxDimension / nativeMax;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      // The icons are alpha-cut art on transparency; without this the
      // downscale fringes every edge against the uninitialised backdrop.
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      source = canvas;
    }
    return new PIXI.BaseTexture(new NodeCanvasResource(source));
  }

  async getImageWhite(path: string) {
    console.log('reading ' + path);
    let data: any = await Jimp.read(path);
    let width = data.width;
    let height = data.height;

    let brt = this.getNewBaseRenderTexture({ width: width, height: height });
    let rt = this.getNewRenderTexture(brt);

    let graphics = this.getNewGraphics();

    let container = this.getNewContainer();
    container.addChild(graphics);

    for (let x = 0; x < width; x++)
      for (let y = 0; y < height; y++) {
        let color = data.getPixelColor(x, y);
        let colorObject = intToRGBA(color);
        let alpha = colorObject.a / 255;
        graphics.beginFill(0xffffff, alpha);
        graphics.drawRect(x, y, 1, 1);
        graphics.endFill();
      }

    this.pixiApp.renderer.render(container, rt, false);

    // Release memory
    container.destroy({ children: true });
    container = null;
    rt.destroy();
    rt = null;
    data = null;
    global.gc && global.gc();

    //console.log('render done for ' + path);
    return brt;
  }

  generateThumbnail(angularBlueprint: Blueprint) {
    let boundingBox = angularBlueprint.getBoundingBox();
    let topLeft = boundingBox[0];
    let bottomRight = boundingBox[1];
    let totalTileSize = new Vector2(bottomRight.x - topLeft.x + 3, bottomRight.y - topLeft.y + 3);

    let thumbnailSize = 200;
    let maxTotalSize = Math.max(totalTileSize.x, totalTileSize.y);
    let thumbnailTileSize = thumbnailSize / maxTotalSize;
    let cameraOffset = new Vector2(-topLeft.x + 1, bottomRight.y + 1);
    if (totalTileSize.x > totalTileSize.y)
      cameraOffset.y += totalTileSize.x / 2 - totalTileSize.y / 2;
    if (totalTileSize.y > totalTileSize.x)
      cameraOffset.x += totalTileSize.y / 2 - totalTileSize.x / 2;

    thumbnailTileSize = Math.floor(thumbnailTileSize);
    cameraOffset.x = Math.floor(cameraOffset.x);
    cameraOffset.y = Math.floor(cameraOffset.y);

    let exportCamera = new CameraService(this.getNewContainer());
    exportCamera.setHardZoom(thumbnailTileSize);
    exportCamera.cameraOffset = cameraOffset;
    exportCamera.overlay = Overlay.Base;
    exportCamera.display = Display.solid;

    exportCamera.container = this.getNewContainer();
    exportCamera.container.sortableChildren = true;

    let graphics = this.getNewGraphics();
    exportCamera.container.addChild(graphics);

    graphics.beginFill(0xffffff);
    graphics.drawRect(0, 0, 200, 200);
    graphics.endFill();

    angularBlueprint.blueprintItems.map(item => {
      item.updateTileables(angularBlueprint);
      item.drawPixi(exportCamera, this);
    });

    let brt = this.getNewBaseRenderTexture({ width: thumbnailSize, height: thumbnailSize });
    let rt = this.getNewRenderTexture(brt);

    this.pixiApp.renderer.render(exportCamera.container, rt, false);

    let base64: string = this.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();

    // Memory release
    exportCamera.container.destroy({ children: true });
    brt.destroy();
    rt.destroy();

    //console.log(base64)
    return base64;
  }
}
