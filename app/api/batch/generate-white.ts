import dotenv from 'dotenv';
import * as fs from 'fs';
import { Jimp } from 'jimp';
import { BExport, SpriteTag } from '../../../lib/index';
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
import { ImageComparator } from './image-comparator';

export class GenerateWhite {
  constructor(databasePath: string) {
    console.log('Running batch GenerateWhite');

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

    this.generateWhite(json);
  }

  async generateWhite(database: BExport) {
    let pixiNodeUtil = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });

    let sourceSpriteModifiers = database.spriteModifiers.filter(s => {
      return s.tags.indexOf(SpriteTag.solid) != -1;
    });

    let sourceTextures: string[] = [];

    for (let sourceSpriteModifier of sourceSpriteModifiers) {
      let sourceSpriteInfo = database.uiSprites.find(s => {
        return s.name == sourceSpriteModifier.spriteInfoName;
      });
      if (sourceSpriteInfo == undefined)
        throw new Error(
          'GenerateWhite.generateWhite : spriteInfoName not found : ' +
            sourceSpriteModifier.spriteInfoName
        );

      if (sourceTextures.indexOf(sourceSpriteInfo.textureName) == -1)
        sourceTextures.push(sourceSpriteInfo.textureName);

      let spriteModifierWhite = BSpriteModifier.clone(sourceSpriteModifier);
      spriteModifierWhite.name = spriteModifierWhite.name + '_white';
      spriteModifierWhite.spriteInfoName = spriteModifierWhite.spriteInfoName + '_white';
      spriteModifierWhite.tags.push(SpriteTag.white);
      database.spriteModifiers.push(spriteModifierWhite);

      let spriteInfoWhite: BSpriteInfo | undefined = undefined;
      for (let spriteInfo of database.uiSprites)
        if (spriteInfo.name == sourceSpriteModifier.spriteInfoName)
          spriteInfoWhite = BSpriteInfo.clone(spriteInfo);

      if (spriteInfoWhite != undefined) {
        spriteInfoWhite.name = spriteModifierWhite.spriteInfoName;
        spriteInfoWhite.textureName = spriteInfoWhite.textureName + '_white';
        database.uiSprites.push(spriteInfoWhite);
      }

      for (let building of database.buildings)
        if (building.sprites.spriteNames.indexOf(sourceSpriteModifier.name) != -1)
          building.sprites.spriteNames.push(spriteModifierWhite.name);
    }

    for (let sourceTexture of sourceTextures) {
      if (!ImageSource.isTextureLoaded(sourceTexture)) {
        let imageUrl = ImageSource.getUrl(sourceTexture);
        try {
          let brt = await pixiNodeUtil.getImageWhite(imageUrl);
          ImageSource.setBaseTexture(sourceTexture, brt);
        } catch (error) {
          console.warn(`⚠️ Skipping white texture ${sourceTexture} - could not load ${imageUrl}`);
          // Continue with other textures instead of failing completely
          continue;
        }
      }

      let baseTexture = ImageSource.getBaseTexture(sourceTexture, pixiNodeUtil);

      let texture = pixiNodeUtil.getNewTextureWhole(baseTexture);

      let brt = pixiNodeUtil.getNewBaseRenderTexture({
        width: texture.width,
        height: texture.height,
      });
      let rt = pixiNodeUtil.getNewRenderTexture(brt);

      let sprite = pixiNodeUtil.getSpriteFrom(texture);

      pixiNodeUtil.pixiApp.renderer.render(sprite, rt);
      let base64: string = pixiNodeUtil.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();
      let whiteBuffer = Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      let whitePath = './assets/images/' + sourceTexture + '_white.png';
      
      // Check if the new white image would be identical to existing file
      const isIdentical = await ImageComparator.isBufferIdenticalToFile(whiteBuffer, whitePath);
      
      if (!isIdentical) {
        console.log('saving white to ' + whitePath);
        let white = await Jimp.read(whiteBuffer);
        white.write(whitePath as `${string}.png`);
      } else {
        console.log('skipping identical white image: ' + whitePath);
      }
    }

    let data = JSON.stringify(database, null, 2);
    fs.writeFileSync('./assets/database/database-white.json', data);
    console.log('done generating white');
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new GenerateWhite('./assets/database/database.json');
}
