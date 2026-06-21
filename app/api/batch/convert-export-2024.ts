// Build-time converter: OniExtract2024 (13-file export) -> single consolidated
// `database.json` in the website's internal shape.
//
// Rationale (see agent/EXPORT_2024_MIGRATION_PLAN.md): rather than rewrite the three
// loaders to ingest 13 files, the heavy mapping lives here in one auditable script. The
// 2024 export drops the multi-sprite atlas model in favour of a single flat pre-rendered
// PNG per building (`export/ui_image/<prefabKey>.png`), so this converter collapses each
// building to one flat icon and emits an empty `spriteModifiers` list (doc §4).
//
// Usage:
//   ts-node app/api/batch/convert-export-2024.ts [options]
//     --export-dir <dir>   root of the 2024 export (default: ./export)
//     --out <file>         output path (default: ./assets/database/database-2024.json)
//     --dry-run            run validation + report counts, write nothing
//
// This intentionally does NOT overwrite the live assets/database/database.json. Cutover
// is a later phase.

import * as fs from 'fs';
import * as path from 'path';
import {
  BBuildingFile2024,
  BElementsFile2024,
  BUiSpriteInfoFile2024,
  BBuildingDef2024,
} from '../../../lib';
import { Overlay } from '../../../lib/src/enums/overlay';

// ---------------------------------------------------------------------------
// viewMode (Klei HashedString hex) -> Overlay enum.
// Hashes verified against Klei Hash.SDBMLower of the overlay-mode name strings.
// Key is the unsigned hex with no leading zeros (see normalizeHash).
// ---------------------------------------------------------------------------
const VIEW_MODE_TO_OVERLAY: { [unsignedHex: string]: Overlay } = {
  '0': Overlay.Base, // "" — no overlay
  '1EDC6185': Overlay.Power, // "Power"
  '4E663A02': Overlay.Liquid, // "LiquidConduit"
  '9DB4F205': Overlay.Gas, // "GasConduit"
  '74DEE5E': Overlay.Automation, // "Logic"
  A4E0B340: Overlay.Oxygen, // "Oxygen"
  '64E3C456': Overlay.Conveyor, // "SolidConveyor"
  '14B49265': Overlay.Decor, // "Decor"
  F02409B6: Overlay.Light, // "Light"
  '18949A94': Overlay.Temperature, // "Temperature"
  A2CCA578: Overlay.Room, // "Rooms"
  '91EE10A1': Overlay.Unknown, // "Radiation" (no dedicated overlay)
};

function normalizeHash(viewMode: string): string {
  // Accepts "0x1EDC6185" / "0x0" etc. -> "1EDC6185" / "0".
  const n = parseInt(viewMode, 16);
  return (n >>> 0).toString(16).toUpperCase();
}

function overlayFromViewMode(viewMode: string, unknown: Set<string>): Overlay {
  const key = normalizeHash(viewMode);
  const mapped = VIEW_MODE_TO_OVERLAY[key];
  if (mapped === undefined) {
    unknown.add(viewMode);
    return Overlay.Base;
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Flat-icon PNG dimensions (read the IHDR chunk; no image decode needed).
// ---------------------------------------------------------------------------
function readPngSize(file: string): { x: number; y: number } | null {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(24);
    const read = fs.readSync(fd, buf, 0, 24, 0);
    if (read < 24) return null;
    // PNG signature
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { x: buf.readUInt32BE(16), y: buf.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

interface ConvertOptions {
  exportDir: string;
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ConvertOptions {
  const opts: ConvertOptions = {
    exportDir: 'export',
    out: 'assets/database/database-2024.json',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--export-dir') opts.exportDir = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
  }
  return opts;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function convertExport2024(opts: ConvertOptions): void {
  const dbDir = path.join(opts.exportDir, 'database');
  const uiImageDir = path.join(opts.exportDir, 'ui_image');

  const buildingFile = readJson<BBuildingFile2024>(path.join(dbDir, 'building.json'));
  const elementsFile = readJson<BElementsFile2024>(path.join(dbDir, 'elements.json'));
  const uiSpriteFile = readJson<BUiSpriteInfoFile2024>(path.join(dbDir, 'uiSpriteInfo.json'));

  const uiImageFiles = new Set(
    fs
      .readdirSync(uiImageDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
  );

  const uiSpriteInfos = uiSpriteFile.uiSpriteInfos;

  // --- Validation accumulators ---
  const unknownViewModes = new Set<string>();
  const missingIcons: string[] = [];
  const missingUiSpriteInfo: string[] = [];
  const missingMenuBuildings: string[] = [];
  const missingCategories: string[] = [];

  // --- Buildings + per-building flat-icon sprite metadata ---
  const buildings: any[] = [];
  const uiSprites: any[] = [];
  const buildingPrefabs = new Set<string>();

  for (const b of buildingFile.bBuildingDefList) {
    buildingPrefabs.add(b.name);

    const iconKey = b.name; // flat icon = ui_image/<prefabKey>.png
    if (!uiImageFiles.has(iconKey)) missingIcons.push(b.name);
    if (!uiSpriteInfos[iconKey]) missingUiSpriteInfo.push(b.name);

    buildings.push(buildingRecord(b, unknownViewModes));

    const size = readPngSize(path.join(uiImageDir, iconKey + '.png')) ?? { x: 0, y: 0 };
    uiSprites.push({
      name: iconKey,
      textureName: iconKey,
      isIcon: true,
      isInputOutput: false,
      uvMin: { x: 0, y: 0 },
      uvSize: { x: size.x, y: size.y },
      realSize: { x: size.x, y: size.y },
      pivot: { x: 0.5, y: 0.5 },
    });
  }

  // --- Elements: elementTable dict -> array ---
  const elements = Object.values(elementsFile.elementTable).map((e) => ({
    name: e.name,
    id: e.id,
    tag: e.tag,
    oreTags: e.oreTags ?? [],
    buildMenuSort: e.buildMenuSort,
    color: e.color,
    conduitColor: e.conduitColor,
    uiColor: e.uiColor,
    icon: e.id + '_ui_0',
  }));

  // --- Build menu categories ---
  const buildMenuCategories = buildingFile.buildMenuCategories.map((c) => ({
    category: c.category,
    categoryName: c.categoryName,
    categoryIcon: c.categoryIcon,
  }));
  const categoryNameToId = new Map<string, number>();
  for (const c of buildMenuCategories) categoryNameToId.set(c.categoryName.toLowerCase(), c.category);

  // --- Build menu items: dict-of-pairs -> flat array ---
  const buildMenuItems: { category: number; buildingId: string }[] = [];
  for (const [categoryName, pairs] of Object.entries(
    buildingFile.buildingAndSubcategoryDataPairs
  )) {
    const categoryId = categoryNameToId.get(categoryName.toLowerCase());
    if (categoryId === undefined) {
      missingCategories.push(categoryName);
      continue;
    }
    for (const pair of pairs) {
      if (!buildingPrefabs.has(pair.Key)) missingMenuBuildings.push(pair.Key);
      buildMenuItems.push({ category: categoryId, buildingId: pair.Key });
    }
  }

  // Overlay sprites: element tiles + info indicators. These are not from the game export —
  // they are handcrafted additions that `OniItem.load()` requires for the element-tile and
  // info-indicator overlays. The corresponding PNGs live in assets/images/ (not ui_image/).
  // Tag values: element_back=27, element_gas_front=28, element_liquid_front=29,
  //             element_vacuum_front=30, info_back=31, info_front=32.
  const overlayUiSprites = [
    { name: 'element_tile_back', textureName: 'element_tile_back', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'gas_tile_front',    textureName: 'gas_tile_front',    isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'liquid_tile_front', textureName: 'liquid_tile_front', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'vacuum_tile_front', textureName: 'vacuum_tile_front', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'info_back',         textureName: 'info_back',         isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `info_front_${i}`, textureName: `info_front_${i}`, isIcon: false, isInputOutput: false,
      uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 },
    })),
  ];
  const overlayModifiers = [
    { name: 'element_tile_back', spriteInfoName: 'element_tile_back', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [27] },
    { name: 'gas_tile_front',    spriteInfoName: 'gas_tile_front',    translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [28] },
    { name: 'liquid_tile_front', spriteInfoName: 'liquid_tile_front', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [29] },
    { name: 'vacuum_tile_front', spriteInfoName: 'vacuum_tile_front', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [30] },
    { name: 'info_back',         spriteInfoName: 'info_back',         translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [31] },
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `info_front_${i}`, spriteInfoName: `info_front_${i}`, translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [32],
    })),
  ];

  const database = {
    buildings,
    uiSprites: [...uiSprites, ...overlayUiSprites],
    spriteModifiers: overlayModifiers,
    buildMenuCategories,
    buildMenuItems,
    elements,
  };

  // --- Report ---
  console.log('convert-export-2024');
  console.log('  buildVersion       :', buildingFile.buildVersion);
  console.log('  buildings          :', buildings.length);
  console.log('  elements           :', elements.length);
  console.log('  uiSprites (flat)   :', uiSprites.length);
  console.log('  buildMenuCategories:', buildMenuCategories.length);
  console.log('  buildMenuItems     :', buildMenuItems.length);
  console.log('  ui_image PNGs      :', uiImageFiles.size);
  console.log('--- validation ---');
  console.log('  buildings missing ui_image PNG :', missingIcons.length);
  if (missingIcons.length) console.log('    ', missingIcons.slice(0, 30).join(', '));
  console.log('  buildings missing uiSpriteInfo :', missingUiSpriteInfo.length);
  if (missingUiSpriteInfo.length)
    console.log('    ', missingUiSpriteInfo.slice(0, 30).join(', '));
  console.log(
    '  build-menu prefabs with no building:',
    missingMenuBuildings.length,
    missingMenuBuildings.length
      ? '(' + [...new Set(missingMenuBuildings)].slice(0, 30).join(', ') + ')'
      : ''
  );
  console.log(
    '  build-menu categories unmapped     :',
    missingCategories.length,
    missingCategories.length ? '(' + missingCategories.join(', ') + ')' : ''
  );
  console.log(
    '  unknown viewMode hashes            :',
    unknownViewModes.size,
    unknownViewModes.size ? '(' + [...unknownViewModes].join(', ') + ')' : ''
  );

  if (opts.dryRun) {
    console.log('--- dry-run: no file written ---');
    return;
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(database));
  console.log('--- wrote', opts.out, '---');
}

function buildingRecord(b: BBuildingDef2024, unknownViewModes: Set<string>): any {
  return {
    DefaultAnimState: b.defaultAnimState,
    name: b.nameString, // rich-text display name (legacy stored rich-text here too)
    prefabId: b.name, // plain id / lookup key
    kanimPrefix: b.name + '_',
    textureName: b.name, // flat-icon key -> ui_image/<key>.png
    uiImage: b.name, // explicit flat-icon reference for the render-collapse phase
    isTile: b.isFoundation || b.isKAnimTile,
    isUtility: b.isUtility,
    isBridge: false, // not present in 2024 export
    drawSolid: false,
    dragBuild: b.dragBuild,
    backColor: 0xffffff,
    sizeInCells: { x: b.widthInCells, y: b.heightInCells },
    sceneLayer: b.sceneLayer,
    objectLayer: b.objectLayer,
    permittedRotations: b.permittedRotations,
    viewMode: overlayFromViewMode(b.viewMode, unknownViewModes),
    tileableLeftRight: false,
    tileableTopBottom: false,
    buildLocationRule: b.buildLocationRule,
    utilities: [], // utility connection offsets are not in the 2024 export
    uiScreens: [],
    sprites: { groupName: 'all sprites', spriteNames: [] }, // flat icon: no atlas sprites
    materialCategory: b.materialCategory ?? [],
    materialMass: b.materialMass ?? [],
  };
}

if (require.main === module) {
  convertExport2024(parseArgs(process.argv.slice(2)));
}
