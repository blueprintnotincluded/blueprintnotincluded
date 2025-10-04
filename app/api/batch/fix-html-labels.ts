import * as fs from 'fs';
import {
  BExport,
  BActiveRangeSideScreen,
  BThresholdSwitchSideScreen,
  BBitSelectorSideScreen,
  BSingleSliderSideScreen,
} from '../../../lib/index';
import { JSDOM } from 'jsdom';
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

export class FixHtmlLabels {
  dom: JSDOM;

  constructor(inputPath?: string) {
    console.log('Running batch FixHtmlLabels');

    this.dom = new JSDOM('<!DOCTYPE html>');

    const compatibilityPath = './frontend/src/assets/database/' + process.argv[2];
    let databaseToFix = inputPath || compatibilityPath;
    console.log('Removing html tags from ' + databaseToFix);

    this.fixHtmlLabels(databaseToFix);
  }

  fixHtmlLabels(path: string) {
    let rawdata = fs.readFileSync(path).toString();
    let database = JSON.parse(rawdata) as BExport;

    for (let building of database.buildings) {
      building.name = this.stripHtml(building.name);
      console.log(building.name);
      for (let uiScreen of building.uiScreens) {
        if (uiScreen.id == 'ActiveRangeSideScreen') {
          let activeRangeSideScreen = uiScreen as BActiveRangeSideScreen;
          activeRangeSideScreen.activateTooltip = this.stripHtml(
            activeRangeSideScreen.activateTooltip
          );
          activeRangeSideScreen.deactivateTooltip = this.stripHtml(
            activeRangeSideScreen.deactivateTooltip
          );
          console.log(activeRangeSideScreen.activateTooltip);
          console.log(activeRangeSideScreen.deactivateTooltip);
        } else if (uiScreen.id == 'ThresholdSwitchSideScreen') {
          let thresholdSwitchSideScreen = uiScreen as BThresholdSwitchSideScreen;
          thresholdSwitchSideScreen.aboveToolTip = this.stripHtml(
            thresholdSwitchSideScreen.aboveToolTip
          );
          thresholdSwitchSideScreen.belowToolTip = this.stripHtml(
            thresholdSwitchSideScreen.belowToolTip
          );
          console.log(thresholdSwitchSideScreen.aboveToolTip);
          console.log(thresholdSwitchSideScreen.belowToolTip);
        } else if (uiScreen.id == 'LogicBitSelectorSideScreen') {
          let logicBitSelectorSideScreen = uiScreen as BBitSelectorSideScreen;
          logicBitSelectorSideScreen.description = this.stripHtml(
            logicBitSelectorSideScreen.description
          );
          console.log(logicBitSelectorSideScreen.description);
        } else if (uiScreen.id == 'SingleSliderSideScreen') {
          let singleSliderSideScreen = uiScreen as BSingleSliderSideScreen;
          singleSliderSideScreen.tooltip = this.stripHtml(singleSliderSideScreen.tooltip);
          console.log(singleSliderSideScreen.tooltip);
        } else console.log(uiScreen.id);
      }
    }

    for (let element of database.elements) {
      element.name = this.stripHtml(element.name);
      console.log(element.name);
    }

    let data = JSON.stringify(database, null, 2);
    fs.writeFileSync(path, data);

    console.log('done fixing labels');
  }

  stripHtml(html: string): string {
    let tmp = this.dom.window.document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new FixHtmlLabels();
}
