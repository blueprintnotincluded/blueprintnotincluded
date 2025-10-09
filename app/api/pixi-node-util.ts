const { loadImage } = require('canvas');
const PIXI = require('../pixi-shim');
require('../pixi-shim/lib/pixi-shim-node.js');
import * as fs from 'fs';
import * as path from 'path';

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

  getNewPixiApp(options: any) {
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
  getNewBaseTexture(url: string) {
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
      try {
        let brt = await this.getImageFromCanvas(imageUrl);
        ImageSource.setBaseTexture(k, brt);
      } catch (error) {
        console.warn(`Failed to load texture ${k} from ${imageUrl}, attempting fallback strategies...`);
        
        // Try to find a similar file with fallback patterns
        const fallbackTexture = await this.tryFallbackTexture(k, imageUrl);
        if (fallbackTexture) {
          ImageSource.setBaseTexture(k, fallbackTexture);
          console.log(`✓ Successfully loaded fallback texture for ${k}`);
        } else {
          console.warn(`⚠️ Skipping texture ${k} - no suitable fallback found`);
          // Continue processing other textures instead of failing completely
        }
      }
    }
  }

  async getImageFromCanvas(path: string) {
    console.log('loading image from file : ' + path);
    let image = await loadImage(path);
    let ressource = new NodeCanvasResource(image);
    let bt = new PIXI.BaseTexture(ressource);
    return bt;
  }

  async tryFallbackTexture(imageId: string, originalPath: string): Promise<any> {
    const directory = path.dirname(originalPath);
    const filename = path.basename(originalPath, '.png');
    
    // Common fallback patterns based on the export mismatch patterns
    const fallbackPatterns: string[] = [
      // Try adding _small suffix (rocket_oxidizer_tank_0 -> rocket_oxidizer_tank_small_0)
      `${filename}_small.png`,
      // Try cluster variant (rocket_oxidizer_tank_0 -> rocket_cluster_oxidizer_tank_0)  
      filename.replace(/^rocket_/, 'rocket_cluster_').concat('.png'),
      // Try removing _0 suffix and adding back with different number
      `${filename.replace(/_0$/, '')}_1.png`,
      // Try without the number suffix entirely
      `${filename.replace(/_\d+$/, '')}.png`,
    ];
    
    // Add liquid variant for tank items if applicable
    if (filename.includes('tank')) {
      fallbackPatterns.push(filename.replace('tank', 'tank_liquid').concat('.png'));
    }
    
    for (const pattern of fallbackPatterns) {
      const fallbackPath = path.join(directory, pattern);
      
      if (fs.existsSync(fallbackPath)) {
        console.log(`Found fallback: ${originalPath} -> ${fallbackPath}`);
        try {
          return await this.getImageFromCanvas(fallbackPath);
        } catch (error) {
          console.warn(`Fallback ${fallbackPath} also failed, trying next...`);
          continue;
        }
      }
    }
    
    // If no fallbacks work, try to find any similar files using fuzzy matching
    try {
      const files = fs.readdirSync(directory);
      const baseName = filename.replace(/_\d+$/, '').toLowerCase();
      
      const similarFile = files.find(file => 
        file.toLowerCase().includes(baseName) && 
        file.endsWith('.png') && 
        file !== path.basename(originalPath)
      );
      
      if (similarFile) {
        const similarPath = path.join(directory, similarFile);
        console.log(`Found similar file: ${originalPath} -> ${similarPath}`);
        return await this.getImageFromCanvas(similarPath);
      }
    } catch (error) {
      console.warn('Could not read directory for fuzzy matching');
    }
    
    return null; // No suitable fallback found
  }

  async getImageWhite(imagePath: string): Promise<any> {
    console.log('reading ' + imagePath);
    try {
      let data: any = await Jimp.read(imagePath);
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
    } catch (error) {
      console.warn(`Failed to load white image from ${imagePath}, attempting fallback strategies...`);
      
      // Try to find a fallback file
      const directory = path.dirname(imagePath);
      const filename = path.basename(imagePath, '.png');
      
      // Use similar fallback logic as in tryFallbackTexture
      const fallbackPatterns: string[] = [
        `${filename}_small.png`,
        filename.replace(/^rocket_/, 'rocket_cluster_').concat('.png'),
        `${filename.replace(/_0$/, '')}_1.png`,
        `${filename.replace(/_\d+$/, '')}.png`,
      ];
      
      if (filename.includes('tank')) {
        fallbackPatterns.push(filename.replace('tank', 'tank_liquid').concat('.png'));
      }
      
      for (const pattern of fallbackPatterns) {
        const fallbackPath = path.join(directory, pattern);
        
        if (fs.existsSync(fallbackPath)) {
          console.log(`Found white fallback: ${path} -> ${fallbackPath}`);
          try {
            return await this.getImageWhite(fallbackPath);
          } catch (fallbackError) {
            console.warn(`White fallback ${fallbackPath} also failed, trying next...`);
            continue;
          }
        }
      }
      
      console.warn(`⚠️ Skipping white image ${imagePath} - no suitable fallback found`);
      throw error; // Re-throw if no fallback works, let the caller handle it
    }
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
