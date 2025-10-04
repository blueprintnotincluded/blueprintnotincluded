import dotenv from 'dotenv';
import * as fs from 'fs';
import { Jimp } from 'jimp';
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
import { PixiNodeUtil } from '../pixi-node-util';
import { AssetPaths } from './asset-paths';
import { AssetLogger } from './asset-logger';

export class GenerateIcons {
  constructor(databasePath: string) {
    AssetLogger.startProcess('GenerateIcons');

    // initialize configuration
    dotenv.config();
    AssetLogger.info(`Environment: ${process.env.ENV_NAME || 'development'}`);

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

    this.generateIcons();
  }

  async generateIcons() {
    AssetLogger.time('IconGeneration');

    let pixiNodeUtil = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });
    await pixiNodeUtil.initTextures();

    const iconSprites = SpriteInfo.keys.filter(
      s => SpriteInfo.getSpriteInfo(s).isIcon && !SpriteInfo.getSpriteInfo(s).isInputOutput
    );
    AssetLogger.info(`Generating ${iconSprites.length} UI icons`);

    let processedCount = 0;

    for (let k of iconSprites) {
      let uiSpriteInfo = SpriteInfo.getSpriteInfo(k);

      // Only generate icons for sprite not in the texture atlases
      if (!uiSpriteInfo.isIcon || uiSpriteInfo.isInputOutput) continue;

      if (processedCount % 10 === 0) {
        AssetLogger.progress(processedCount, iconSprites.length, `Generating icon: ${k}`);
        AssetLogger.memory();
      }

      if (k == 'electrical_disconnected')
        AssetLogger.debug(`Processing special icon: ${JSON.stringify(uiSpriteInfo)}`);

      let texture = uiSpriteInfo.getTexture(pixiNodeUtil);
      let uiSprite = pixiNodeUtil.getSpriteFrom(texture);

      let size = Math.max(texture.width, texture.height);

      let container = pixiNodeUtil.getNewContainer();
      container.addChild(uiSprite);

      uiSprite.x = 0;
      uiSprite.y = 0;

      if (texture.width > texture.height) uiSprite.y += texture.width / 2 - texture.height / 2;
      if (texture.height > texture.width) uiSprite.x += texture.height / 2 - texture.width / 2;

      let brt = pixiNodeUtil.getNewBaseRenderTexture({ width: size, height: size });
      let rt = pixiNodeUtil.getNewRenderTexture(brt);

      pixiNodeUtil.pixiApp.renderer.render(container, rt, true);
      let base64: string = pixiNodeUtil.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();

      let icon = await Jimp.read(
        Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64')
      );

      // Ensure directories exist
      AssetPaths.ensureDirectories();

      let iconPath = AssetPaths.uiIcon(k);
      AssetLogger.fileOperation('Writing icon', iconPath);
      icon.write(iconPath as `${string}.png`);

      let frontendIconPath = AssetPaths.frontendUiIcon(k);
      AssetLogger.fileOperation('Writing frontend icon', frontendIconPath);
      icon.write(frontendIconPath as `${string}.png`);

      // Free memory
      brt.destroy();
      brt = null;
      rt.destroy();
      rt = null;
      container.destroy({ children: true });
      container = null;
      global.gc && global.gc();

      processedCount++;
    }

    AssetLogger.timeEnd('IconGeneration');
    AssetLogger.completeProcess('GenerateIcons');
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new GenerateIcons(AssetPaths.databaseJson);
}
