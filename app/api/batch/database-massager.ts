import * as fs from 'fs';

import { BExport } from '../../../lib/index';

interface BuildMenuItem {
  category: number;
  buildingId: string;
}

interface BuildingTranslator {
  buildMenuItems: {
    from: BuildMenuItem;
    to: BuildMenuItem;
  }[];
}

const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath).toString());
const writeJson = (filePath: string, data: object) =>
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
export const updateJsonFile = (filePath: string, mutator: Function) =>
  writeJson(filePath, mutator(readJson(filePath)));

// Uses a list of "alterations" needed for the build menu items
// Each entry contains an optional from and to.
// No "to" present? Delete the menu item.
// No "from" present? TODO: new building?
// Both present? Update the buildingId accordingly.
export const renameBuildings = (database: BExport, instructionsPath: string) => {
  const instructions = readJson(instructionsPath) as BuildingTranslator;
  instructions.buildMenuItems.forEach(({ from, to }) => {
    const finder = (b: BuildMenuItem) => b.buildingId == from.buildingId;
    const menuItem = database.buildMenuItems.find(finder);
    if (from && to) {
      menuItem!.buildingId = to.buildingId;
    } else if (from && !to) {
      database.buildMenuItems.splice(database.buildMenuItems.findIndex(finder), 1);
    }
  });
  return database;
};
