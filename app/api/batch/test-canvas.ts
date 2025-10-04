import {
  BniBlueprint,
  Blueprint,
  ImageSource,
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  BSpriteInfo,
  SpriteInfo,
  BSpriteModifier,
  SpriteModifier,
  BBuilding,
  OniItem,
  Vector2,
  CameraService,
  Overlay,
  Display,
  PixiUtil,
} from '../../../lib';
import * as fs from 'fs';
import { PixiNodeUtil } from '../pixi-node-util';
//var PIXI = require('../../pixi-shim')
//require('../../pixi-shim/lib/pixi-shim-node.js')
//require('../../pixi-shim/lib/node/canvas.js')

//import {resources} from 'pixi.js-legacy'

//const { createCanvas, loadImage } = require('canvas')

/*
class NodeCanvasResource extends resources.BaseImageResource
{
    constructor(source: any) {
        super(source);
    }
}
*/

export class TestCanvas {
  //implements PixiUtil
  constructor() {
    // Read database
    let rawdata = fs.readFileSync('./assets/database/database-white.json').toString();
    let json = JSON.parse(rawdata);

    ImageSource.init();

    let elements: BuildableElement[] = json.elements;
    BuildableElement.init();
    BuildableElement.load(elements);

    let buildMenuCategories: BuildMenuCategory[] = json.buildMenuCategories;
    BuildMenuCategory.init();
    BuildMenuCategory.load(buildMenuCategories);

    let buildMenuItems: BuildMenuItem[] = json.buildMenuItems;
    BuildMenuItem.init();
    BuildMenuItem.load(buildMenuItems);

    let uiSprites: BSpriteInfo[] = json.uiSprites;
    SpriteInfo.init();
    SpriteInfo.load(uiSprites);

    let spriteModifiers: BSpriteModifier[] = json.spriteModifiers;
    SpriteModifier.init();
    SpriteModifier.load(spriteModifiers);

    let buildings: BBuilding[] = json.buildings;
    OniItem.init();
    OniItem.load(buildings);

    this.testCanvas();
  }

  getNewContainer() {
    return new PIXI.Container();
  }

  getSpriteFrom(ressource: any) {
    return PIXI.Sprite.from(ressource);
  }

  getNewBaseTexture(url: string) {
    throw new Error('This should not be called on node : preload all textures');
  }

  getNewTexture(baseTex: PIXI.BaseTexture, rectangle: PIXI.Rectangle) {
    return new PIXI.Texture(baseTex, rectangle);
  }

  getNewRectangle(x1: number, y1: number, x2: number, y2: number) {
    return new PIXI.Rectangle(x1, y1, x2, y2);
  }

  async testCanvas() {
    let rawdata = fs.readFileSync('washroom.blueprint');
    let data: BniBlueprint = JSON.parse(rawdata.toString());

    let blueprint = new Blueprint();
    blueprint.importFromBni(data);

    console.log(blueprint);

    let options = {
      forceCanvas: true,
      preserveDrawingBuffer: true,
    };
    let pixiNodeUtil = new PixiNodeUtil(options);

    await pixiNodeUtil.initTextures();
    let base64 = pixiNodeUtil.generateThumbnail(blueprint);
    console.log(base64);

    //let image = await loadImage('./assets/images/SweepBotStation_group_sprite.png');
    //let ressource = new NodeCanvasResource(image);
    //let btImage = new PIXI.BaseTexture(ressource);
    /*
    let btImage = await this.getImageFromCanvas('./assets/images/SweepBotStation_group_sprite.png')
    let tImage = PixiPolyfill.pixiPolyfill.getNewTextureWhole(btImage);
    let sprite = PixiPolyfill.pixiPolyfill.getNewSprite(tImage);
    let container = PixiPolyfill.pixiPolyfill.getNewContainer();
    container.addChild(sprite);
    sprite.x = 0;
    sprite.y = 0;
    sprite.alpha = 0.5;
    sprite.tint = 0xFF00FF;
    let brt = PixiPolyfill.pixiPolyfill.getNewBaseRenderTexture({width: btImage.width, height: btImage.height});
    let rt = PixiPolyfill.pixiPolyfill.getNewRenderTexture(brt);

    let options = {
      forceCanvas: true,
      preserveDrawingBuffer: true
    }
    let pixiApp = new PIXI.Application(options);
    pixiApp.renderer.render(container, rt, true);
    let base64: string = PixiPolyfill.pixiPolyfill.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();
    console.log(base64);
    */
  }

  /*
  async initTextures() {

    for (let k of ImageSource.keys) {
      let imageUrl = ImageSource.getUrl(k)!;
      let brt = await this.getImageFromCanvas(imageUrl);
      ImageSource.setBaseTexture(k, brt);
    }

    console.log(new Date());
    console.log('render done for all');
  }

  async getImageFromCanvas(path: string) {
    console.log('loading image from file : ' + path)
    let image = await loadImage(path);
    let ressource = new NodeCanvasResource(image);
    let bt = new PIXI.BaseTexture(ressource);
    return bt;
  }
  */
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new TestCanvas();
}
