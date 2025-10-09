import dotenv from 'dotenv';
import { Database } from '../db';
import { BlueprintModel, Blueprint } from '../models/blueprint';
import * as fs from 'fs';
import { Jimp } from 'jimp';
import { BatchUtils } from './batch-utils';
import { BExport, SpriteTag, Vector2 } from '../../../lib/index';
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
  MdbBlueprint,
} from '../../../lib';
import { PixiNodeUtil } from '../pixi-node-util';

export class GenerateGroups {
  constructor(databasePath: string) {
    console.log('Running batch GenerateGroups');

    // initialize configuration
    dotenv.config();
    console.log(process.env.ENV_NAME);

    // Read database
    let rawdata = fs.readFileSync(databasePath).toString();
    let json = JSON.parse(rawdata);
    
    // Strip HTML tags from building and element names (same as FixHtmlLabels does)
    json.buildings.forEach((building: any) => {
      building.name = this.stripHtml(building.name);
    });
    json.elements.forEach((element: any) => {
      element.name = this.stripHtml(element.name);
    });

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

    this.generateGroups(json);
  }

  async generateGroups(database: BExport) {
    let pixiNodeUtil = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });
    await pixiNodeUtil.initTextures();

    for (let oniItem of OniItem.oniItems) {
      if (oniItem.id == OniItem.elementId || oniItem.id == OniItem.infoId) continue;

      let buildingInDatabase = database.buildings.find(building => {
        return building.prefabId == oniItem.id;
      });
      if (buildingInDatabase == undefined)
        throw new Error('GenerateGroups.generateGroups : building not found : ' + oniItem.id);

      let spritesToGroup: SpriteModifier[] = [];
      for (let spriteModifier of oniItem.spriteGroup.spriteModifiers) {
        if (spriteModifier == undefined) console.log(oniItem);

        if (
          spriteModifier.tags.indexOf(SpriteTag.solid) != -1 &&
          spriteModifier.tags.indexOf(SpriteTag.tileable) == -1 &&
          spriteModifier.tags.indexOf(SpriteTag.connection) == -1
        )
          spritesToGroup.push(spriteModifier);
      }

      if (spritesToGroup.length > 1) {
        let container = pixiNodeUtil.getNewContainer();
        container.sortableChildren = true;

        let modifierId = oniItem.id + '_group_modifier';
        let spriteInfoId = oniItem.id + '_group_sprite';
        let textureName = oniItem.id + '_group_sprite';

        let indexDrawPart = 0;
        for (let spriteModifier of oniItem.spriteGroup.spriteModifiers) {
          if (
            spriteModifier.tags.indexOf(SpriteTag.solid) == -1 ||
            spriteModifier.tags.indexOf(SpriteTag.tileable) != -1 ||
            spriteModifier.tags.indexOf(SpriteTag.connection) != -1
          )
            continue;

          // Remove from the database building sprite list
          let indexToRemove = buildingInDatabase.sprites.spriteNames.indexOf(
            spriteModifier.spriteModifierId
          );
          buildingInDatabase.sprites.spriteNames.splice(indexToRemove, 1);

          // Then from the sprite modifiers
          let spriteModifierToRemove = database.spriteModifiers.find(s => {
            return s.name == spriteModifier.spriteModifierId;
          });
          if (spriteModifierToRemove != null) {
            indexToRemove = database.spriteModifiers.indexOf(spriteModifierToRemove);
            database.spriteModifiers.splice(indexToRemove, 1);
          }

          let spriteInfoToRemove = database.uiSprites.find(s => {
            return s.name == spriteModifier.spriteInfoName;
          });
          if (spriteInfoToRemove != null) {
            indexToRemove = database.uiSprites.indexOf(spriteInfoToRemove);
            database.uiSprites.splice(indexToRemove, 1);
          }

          let spriteInfo = SpriteInfo.getSpriteInfo(spriteModifier.spriteInfoName);

          let texture = spriteInfo.getTexture(pixiNodeUtil);
          let sprite = pixiNodeUtil.getSpriteFrom(texture);
          sprite.anchor.set(spriteInfo.pivot.x, 1 - spriteInfo.pivot.y);
          sprite.x = 0 + spriteModifier.translation.x;
          sprite.y = 0 - spriteModifier.translation.y;
          sprite.width = spriteInfo.realSize.x;
          sprite.height = spriteInfo.realSize.y;
          sprite.scale.x = spriteModifier.scale.x;
          sprite.scale.y = spriteModifier.scale.y;
          sprite.angle = -spriteModifier.rotation;
          sprite.zIndex -= indexDrawPart / 50;

          container.addChild(sprite);

          indexDrawPart++;
        }

        buildingInDatabase.sprites.spriteNames.push(modifierId);

        container.calculateBounds();
        let bounds = container.getBounds();
        bounds.x = Math.floor(bounds.x);
        bounds.y = Math.floor(bounds.y);
        bounds.width = Math.ceil(bounds.width);
        bounds.height = Math.ceil(bounds.height);

        let diff = new Vector2(bounds.x, bounds.y);
        for (let child of container.children) {
          child.x -= diff.x;
          child.y -= diff.y;
        }

        let pivot = new Vector2(
          1 - (bounds.width + bounds.x) / bounds.width,
          (bounds.height + bounds.y) / bounds.height
        );
        //console.log(pivot);

        // Create and add the new sprite modifier to replace the group
        let newSpriteModifier = new BSpriteModifier();
        newSpriteModifier.name = modifierId;
        newSpriteModifier.spriteInfoName = spriteInfoId;
        newSpriteModifier.rotation = 0;
        newSpriteModifier.scale = new Vector2(1, 1);
        newSpriteModifier.translation = new Vector2(0, 0);
        newSpriteModifier.tags = [SpriteTag.solid];
        database.spriteModifiers.push(newSpriteModifier);

        // Create and add the new spriteInfo
        let newSpriteInfo = new BSpriteInfo();
        newSpriteInfo.name = spriteInfoId;
        newSpriteInfo.textureName = textureName;
        newSpriteInfo.pivot = pivot;
        newSpriteInfo.uvMin = new Vector2(0, 0);
        newSpriteInfo.realSize = new Vector2(bounds.width, bounds.height);
        newSpriteInfo.uvSize = new Vector2(bounds.width, bounds.height);
        database.uiSprites.push(newSpriteInfo);

        let brt = pixiNodeUtil.getNewBaseRenderTexture({
          width: bounds.width,
          height: bounds.height,
        });
        let rt = pixiNodeUtil.getNewRenderTexture(brt);

        pixiNodeUtil.pixiApp.renderer.render(container, rt);
        let base64: string = pixiNodeUtil.pixiApp.renderer.plugins.extract.canvas(rt).toDataURL();

        let group = await Jimp.read(
          Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64')
        );
        let groupePath = './assets/images/' + textureName + '.png';
        console.log('saving group to ' + groupePath);
        group.write(groupePath as `${string}.png`);

        // Free memory
        brt.destroy();
        brt = null;
        rt.destroy();
        rt = null;
        container.destroy({ children: true });
        container = null;
        global.gc && global.gc();
      } else console.log(oniItem.id + ' should not be grouped');
    }

    let data = JSON.stringify(database, null, 2);
    fs.writeFileSync('./assets/database/database-groups.json', data);
    console.log('done generating groups');
  }

  /**
   * Strip HTML tags from text (same logic as FixHtmlLabels)
   */
  private stripHtml(html: string): string {
    // Simple regex-based HTML stripping since we don't want to add JSDOM dependency
    return html.replace(/<[^>]*>/g, '');
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new GenerateGroups('./assets/database/database.json');
}
