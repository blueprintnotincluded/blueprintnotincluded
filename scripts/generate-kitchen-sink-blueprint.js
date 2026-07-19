#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const databasePath = path.join(repoRoot, 'assets/database/database-2024.json');
const outputPath = path.resolve(process.argv[2] || path.join(repoRoot, 'kitchen-sink.blueprint'));
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

const layoutWidth = 120;
const buildingGap = 2;
let cursorX = 0;
let cursorY = 0;
let rowHeight = 0;

function selectableElements(category) {
  if (category === 'BuildingFiber') return [];

  const categoryParts = category.split('&');
  return database.elements
    .filter(
      element =>
        element.oreTags.includes('Solid') &&
        categoryParts.some(part => element.id === part || element.oreTags.includes(part))
    )
    .sort((left, right) => left.buildMenuSort - right.buildMenuSort);
}

function tileOffsetX(width) {
  return 1 - (width + (width % 2)) / 2;
}

const footprints = [];
const buildings = database.buildings.map(building => {
  const width = building.sizeInCells.x;
  const height = building.sizeInCells.y;

  if (cursorX > 0 && cursorX + width > layoutWidth) {
    cursorX = 0;
    cursorY += rowHeight + buildingGap;
    rowHeight = 0;
  }

  const left = cursorX;
  const bottom = cursorY;
  const offset = {
    x: left - tileOffsetX(width),
    y: bottom,
  };

  footprints.push({
    id: building.prefabId,
    left,
    right: left + width - 1,
    bottom,
    top: bottom + height - 1,
  });

  cursorX += width + buildingGap;
  rowHeight = Math.max(rowHeight, height);

  return {
    offset,
    buildingdef: building.prefabId,
    selected_elements: building.materialCategory.flatMap(category => {
      const choices = selectableElements(category);
      return choices.length > 0 ? [choices[0].tag] : [];
    }),
  };
});

const buildingTop = footprints.reduce((maximum, footprint) => Math.max(maximum, footprint.top), 0);
const noteColumns = 30;
const noteSpacing = 3;
const noteStartY = buildingTop + 4;
const worldNotes = database.elements.map((element, index) => ({
  x: (index % noteColumns) * noteSpacing,
  y: noteStartY + Math.floor(index / noteColumns) * noteSpacing,
  type: 1,
  id: element.tag,
  mass: 1,
  temp: 293.15,
}));

for (let index = 0; index < footprints.length; index++) {
  const left = footprints[index];
  for (let otherIndex = index + 1; otherIndex < footprints.length; otherIndex++) {
    const right = footprints[otherIndex];
    const overlaps =
      left.left <= right.right &&
      left.right >= right.left &&
      left.bottom <= right.top &&
      left.top >= right.bottom;
    if (overlaps) throw new Error(`${left.id} overlaps ${right.id}`);
  }
}

const blueprint = {
  blueprintVersion: 3,
  friendlyname: 'Kitchen Sink - One of Everything',
  userdesc:
    'Generated from database-2024.json for manual QA. Contains every catalogued building and one element note for every catalogued element.',
  icon: 'Tile',
  icontint: 'FFFFFFFF',
  buildings,
  digcommands: [],
  worldNotes,
};

fs.writeFileSync(outputPath, `${JSON.stringify(blueprint, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`Buildings: ${buildings.length}`);
console.log(`Build-menu items represented: ${database.buildMenuItems.length}`);
console.log(`Element notes: ${worldNotes.length}`);
console.log(`Footprint: ${layoutWidth} x ${worldNotes.at(-1).y + 1} cells`);
console.log('Verified: no building footprints overlap');
