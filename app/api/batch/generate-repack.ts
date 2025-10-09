import dotenv from 'dotenv';
import * as fs from 'fs';
import { Jimp } from 'jimp';
import { BExport, Vector2 } from '../../../lib/index';
import {
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
} from '../../../lib';
import { BinController } from './bin-packing/bin-controller';
import { PixiNodeUtil } from '../pixi-node-util';
import { AssetPaths } from './asset-paths';
import { ImageComparator } from './image-comparator';

export class GenerateRepack {
  constructor(databasePath: string) {
    console.log('Running batch GenerateRepack');

    // initialize configuration
    dotenv.config();
    console.log(process.env.ENV_NAME);

    // Read database
    let rawdata = fs.readFileSync(databasePath).toString();
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

    this.generateRepack(json);
  }

  async generateRepack(database: BExport) {
    let pixiNodeUtil = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });
    await pixiNodeUtil.initTextures();

    // Tests bintrays
    let traySize = 1024;
    let textureBaseString = 'repack_';
    let binController = new BinController(new Vector2(traySize, traySize));

    let bleed = new Vector2(10, 10);
    /*
    // Tests
    binController.addItem('test_0', new Vector2(50, 50), bleed);
    binController.addItem('test_1', new Vector2(50, 50), bleed);
    binController.addItem('test_2', new Vector2(10, 50), bleed);
    binController.addItem('test_3', new Vector2(10, 50), bleed);
    */

    // First, we clone the existing spriteInfos into a new array :
    let newSpriteInfos: BSpriteInfo[] = [];

    for (let spriteInfo of SpriteInfo.spriteInfos) {
      // We don't need the ui icons in the texture atlases for pixi
      if (spriteInfo.isIcon && !spriteInfo.isInputOutput) continue;

      // Copy the sprite info into the BSpriteInfo.
      // We need to start from the start info because some of them are generated (tiles)
      let newSpriteInfo = new BSpriteInfo();
      newSpriteInfo.name = spriteInfo.spriteInfoId;
      newSpriteInfo.uvMin = Vector2.cloneNullToZero(spriteInfo.uvMin);
      newSpriteInfo.uvSize = Vector2.cloneNullToZero(spriteInfo.uvSize);
      newSpriteInfo.realSize = Vector2.cloneNullToZero(spriteInfo.realSize);
      newSpriteInfo.pivot = Vector2.cloneNullToZero(spriteInfo.pivot);
      newSpriteInfo.isIcon = spriteInfo.isIcon;
      newSpriteInfo.isInputOutput = spriteInfo.isInputOutput;
      newSpriteInfos.push(newSpriteInfo);
    }

    // Sort our new array of BSpriteInfo by descending height
    newSpriteInfos = newSpriteInfos.sort((i1, i2) => {
      return i2.uvSize.y - i1.uvSize.y;
    });

    for (let spriteInfo of newSpriteInfos) {
      let itemAdded = binController.addItem(
        spriteInfo.name,
        Vector2.cloneNullToZero(spriteInfo.uvSize),
        bleed
      );
      if (itemAdded != null) {
        spriteInfo.uvMin = Vector2.cloneNullToZero(itemAdded.uvStart);
        spriteInfo.textureName = textureBaseString + itemAdded.trayIndex;
      }
    }

    database.uiSprites = newSpriteInfos;

    for (let trayIndex = 0; trayIndex < binController.binTrays.length; trayIndex++) {
      let brt = pixiNodeUtil.getNewBaseRenderTexture({
        width: binController.binTrays[trayIndex].binSize.x,
        height: binController.binTrays[trayIndex].binSize.y,
      });
      let rt = pixiNodeUtil.getNewRenderTexture(brt);

      let graphics = pixiNodeUtil.getNewGraphics();
      let container = pixiNodeUtil.getNewContainer();
      container.addChild(graphics);

      for (let spriteInfo of newSpriteInfos.filter(s => {
        return s.textureName == textureBaseString + trayIndex;
      })) {
        let repackBleed = 5;
        let realBleed = new Vector2();
        let texture = SpriteInfo.getSpriteInfo(spriteInfo.name).getTextureWithBleed(
          repackBleed,
          realBleed,
          pixiNodeUtil
        );
        let sprite = pixiNodeUtil.getSpriteFrom(texture);

        sprite.x = spriteInfo.uvMin.x - realBleed.x;
        sprite.y = spriteInfo.uvMin.y - realBleed.y;
        container.addChild(sprite);

        //graphics.beginFill(0x007AD9);
        //graphics.drawRect(spriteInfo.uvMin.x, spriteInfo.uvMin.y, spriteInfo.uvSize.x, spriteInfo.uvSize.y);
        //graphics.endFill();
      }

      pixiNodeUtil.pixiApp.renderer.render(container, rt, true);

      let base64: string = pixiNodeUtil.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();
      let repackBuffer = Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64');

      // Ensure directories exist
      AssetPaths.ensureDirectories();

      let repackPath = AssetPaths.repackTexture(trayIndex);
      let repackFrontendPath = AssetPaths.frontendRepackTexture(trayIndex);

      // Check if the new repack images would be identical to existing files
      const [backendIdentical, frontendIdentical] = await Promise.all([
        ImageComparator.isBufferIdenticalToFile(repackBuffer, repackPath),
        ImageComparator.isBufferIdenticalToFile(repackBuffer, repackFrontendPath)
      ]);

      // Only write files if they would be different
      if (!backendIdentical) {
        console.log('saving repack to ' + repackPath);
        let repack = await Jimp.read(repackBuffer);
        repack.write(repackPath as `${string}.png`);
      } else {
        console.log('skipping identical repack: ' + repackPath);
      }

      if (!frontendIdentical) {
        console.log('saving repack to ' + repackFrontendPath);
        let repack = await Jimp.read(repackBuffer);
        repack.write(repackFrontendPath as `${string}.png`);
      } else {
        console.log('skipping identical repack: ' + repackFrontendPath);
      }
    }

    let data = JSON.stringify(database, null, 2);
    fs.writeFileSync(AssetPaths.databaseRepack, data);
    fs.writeFileSync(AssetPaths.frontendDatabaseJson, data);
    console.log('done generating repack');
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new GenerateRepack(AssetPaths.databaseJson);
}
