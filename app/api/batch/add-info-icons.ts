import * as fs from 'fs';
import {
  BExport,
  BActiveRangeSideScreen,
  BThresholdSwitchSideScreen,
  BBitSelectorSideScreen,
  BSingleSliderSideScreen,
  Vector2,
  SpriteTag,
} from '../../../lib/index';
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
import { InfoIcon, BlueprintItemInfo } from '../../../lib/src/blueprint/blueprint-item-info';

export class AddInfoIcons {
  constructor(inputPath?: string) {
    console.log('Running batch FixHtmlLabels');

    // Read database
    let databaseToFix = inputPath || './assets/database/' + process.argv[2];
    console.log('Adding info icons srpite infos and sprite modifiers to ' + databaseToFix);

    this.addInfoIcons(databaseToFix);
  }

  addInfoIcons(path: string) {
    let rawdata = fs.readFileSync(path).toString();
    let database = JSON.parse(rawdata) as BExport;

    let spriteModifiersNames: string[] = [
      'element_tile_back',
      'gas_tile_front',
      'liquid_tile_front',
      'vacuum_tile_front',
      'info_back',
    ];
    let spriteModifierTags: SpriteTag[] = [
      SpriteTag.element_back,
      SpriteTag.element_gas_front,
      SpriteTag.element_liquid_front,
      SpriteTag.element_vacuum_front,
      SpriteTag.info_back,
    ];
    for (let i = 0; i < 12; i++) {
      spriteModifiersNames.push('info_front_' + i);
      spriteModifierTags.push(SpriteTag.info_front);
    }

    for (let i = 0; i < spriteModifiersNames.length; i++) {
      let spriteModifier = new BSpriteModifier();
      spriteModifier.name = spriteModifiersNames[i];
      spriteModifier.spriteInfoName = spriteModifiersNames[i];
      spriteModifier.rotation = 0;
      spriteModifier.translation = Vector2.zero();
      spriteModifier.scale = Vector2.one();
      spriteModifier.tags = [spriteModifierTags[i]];
      database.spriteModifiers.push(spriteModifier);

      let spriteInfoBack = new BSpriteInfo();
      spriteInfoBack.name = spriteModifiersNames[i];
      spriteInfoBack.textureName = spriteModifiersNames[i];
      spriteInfoBack.isIcon = false;
      spriteInfoBack.isInputOutput = false;
      spriteInfoBack.pivot = new Vector2(1, 0);
      spriteInfoBack.realSize = new Vector2(100, 100);
      spriteInfoBack.uvMin = new Vector2(0, 0);
      spriteInfoBack.uvSize = new Vector2(128, 128);
      database.uiSprites.push(spriteInfoBack);
    }

    let data = JSON.stringify(database, null, 2);
    fs.writeFileSync(path, data);

    console.log('done adding info icons');
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new AddInfoIcons();
}
