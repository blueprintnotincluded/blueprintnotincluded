// Blueprint fixtures for room-detector tests, built against the real
// database-2024.json so footprints and roomTags are the shipped ones.

import * as fs from 'fs';
import * as path from 'path';
import {
  Blueprint,
  BlueprintHelpers,
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  ImageSource,
  OniItem,
  SpriteInfo,
  SpriteModifier,
  Vector2,
  TerrainFeature,
} from '../../lib';

let databaseLoaded = false;

// Same bootstrap as the backend (app/app.ts): OniItem.load needs the static
// element/sprite/menu tables populated first. Idempotent across test files.
export function loadGameDatabase(): void {
  if (databaseLoaded && OniItem.oniItemsMap != null) return;
  const databaseJsonPath = path.join(__dirname, '../../assets/database/database-2024.json');
  const database = JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
  ImageSource.init();
  BuildableElement.init();
  BuildableElement.load(database.elements);
  BuildMenuCategory.init();
  BuildMenuCategory.load(database.buildMenuCategories);
  BuildMenuItem.init();
  BuildMenuItem.load(database.buildMenuItems);
  SpriteInfo.init();
  SpriteInfo.load(database.uiSprites);
  SpriteModifier.init();
  SpriteModifier.load(database.spriteModifiers);
  OniItem.init();
  OniItem.load(database.buildings);
  TerrainFeature.init();
  TerrainFeature.load(database.terrainFeatures);
  databaseLoaded = true;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
}

// Places a building with its footprint's bottom-left corner at (x, y) — easier
// to reason about in fixtures than the game's centered anchor position.
export function place(blueprint: Blueprint, id: string, x: number, y: number): void {
  // Fixture ids are always known-good; a null here means the fixture itself is broken.
  const item = BlueprintHelpers.createInstance(id)!;
  const tileOffset = item.oniItem.tileOffset;
  item.position = new Vector2(x - tileOffset.x, y - tileOffset.y);
  item.prepareBoundingBox();
  blueprint.addBlueprintItem(item);
}

// Adds a rectangular Tile shell around the interior (x0, y0)–(x0+innerW-1,
// y0+innerH-1) so the interior is a fully enclosed cavity of innerW×innerH cells.
export function addRoomShell(
  blueprint: Blueprint,
  x0: number,
  y0: number,
  innerW: number,
  innerH: number
): void {
  for (let x = x0 - 1; x <= x0 + innerW; x++) {
    place(blueprint, 'Tile', x, y0 - 1);
    place(blueprint, 'Tile', x, y0 + innerH);
  }
  for (let y = y0; y < y0 + innerH; y++) {
    place(blueprint, 'Tile', x0 - 1, y);
    place(blueprint, 'Tile', x0 + innerW, y);
  }
}

// Enclosed innerW×innerH room at origin with the given contents (interior
// bottom-left = (0, 0), footprint-bottom-left coordinates).
export function roomBlueprint(
  innerW: number,
  innerH: number,
  contents: Placement[] = []
): Blueprint {
  const blueprint = new Blueprint();
  addRoomShell(blueprint, 0, 0, innerW, innerH);
  for (const c of contents) place(blueprint, c.id, c.x, c.y);
  return blueprint;
}

// ASCII fixture: rows top-down, columns left-right; row 0 is the highest y and
// the bottom row is y = 0. '.'/' ' = empty; 'W' = Tile unless overridden. Any
// other char places the legend's prefab with its footprint bottom-left at that
// cell — multi-cell buildings extend up/right from the marked cell, so cells a
// footprint covers can be written as '.'.
export function blueprintFromAscii(
  rows: string[],
  legend: Record<string, string> = {}
): Blueprint {
  const resolved: Record<string, string> = { W: 'Tile', ...legend };
  const blueprint = new Blueprint();
  for (let r = 0; r < rows.length; r++) {
    const y = rows.length - 1 - r;
    for (let x = 0; x < rows[r].length; x++) {
      const char = rows[r][x];
      if (char === '.' || char === ' ') continue;
      const id = resolved[char];
      if (id === undefined) throw new Error(`blueprintFromAscii: no legend entry for '${char}'`);
      place(blueprint, id, x, y);
    }
  }
  return blueprint;
}
