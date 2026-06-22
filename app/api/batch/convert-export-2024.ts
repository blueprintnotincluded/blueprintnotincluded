// Import pipeline: OniExtract2024 (13-file export) -> the website's consolidated
// `database-2024.json` + all served sprite assets. This is the single repeatable
// step to run after dropping a fresh export into ./export (see `npm run import:2024`).
//
// What it does, end to end:
//   1. Reads the 13 JSONs from export/database/ and maps them to the website shape.
//   2. Writes assets/database/database-2024.json and both database-2024.zip files
//      (backend + frontend/src/assets).
//   3. Syncs export/ui_image/ and export/connection_sprites/ into both asset roots,
//      replacing the targets so renamed/removed files don't linger.
//   4. Prints a validation report (missing icons, incomplete connection dirs, etc.).
//
// Rationale (see agent/EXPORT_2024_MIGRATION_PLAN.md): rather than rewrite the three
// loaders to ingest 13 files, the heavy mapping lives here in one auditable script. The
// 2024 export drops the multi-sprite atlas model in favour of a single flat pre-rendered
// PNG per building (`export/ui_image/<prefabKey>.png`), so this converter collapses each
// building to one flat icon, plus 16 per-connection-state sprites for connectables.
//
// Usage:
//   ts-node app/api/batch/convert-export-2024.ts [options]
//     --export-dir <dir>   root of the 2024 export (default: ./export)
//     --out <file>         output path (default: ./assets/database/database-2024.json)
//     --dry-run            run validation + report counts, write/copy nothing

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createCanvas, Image } from 'canvas';
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

// Recursive directory copy (fs.cpSync is unavailable in the backend's @types/node).
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

// Mirror an export sub-folder into each served asset root, replacing the target
// so renamed/removed files don't linger across re-imports. No-op if src is absent.
function syncAssetDir(src: string, targets: string[], label: string): void {
  if (!fs.existsSync(src)) {
    console.log('--- skipped', label, '(not in export) ---');
    return;
  }
  for (const target of targets) {
    fs.rmSync(target, { recursive: true, force: true });
    copyDirRecursive(src, target);
    console.log('--- synced', label, '->', path.normalize(target), '---');
  }
}

// ---------------------------------------------------------------------------
// Connection sprites: connection_sprites/<prefabId>/{0..15}.png. A building is
// "connectable" iff its dir exists (the 2024 export omits tileableLeftRight/
// tileableTopBottom — dir presence is the signal). Returns the set of prefabIds
// plus any dirs missing one of the 16 bitmask PNGs.
const CONNECTION_SPRITE_COUNT = 16;
function readConnectablePrefabs(connectionDir: string): {
  prefabs: Set<string>;
  incomplete: { prefab: string; missing: number[] }[];
} {
  const prefabs = new Set<string>();
  const incomplete: { prefab: string; missing: number[] }[] = [];
  if (!fs.existsSync(connectionDir)) return { prefabs, incomplete };

  for (const prefab of fs.readdirSync(connectionDir)) {
    const dir = path.join(connectionDir, prefab);
    if (!fs.statSync(dir).isDirectory()) continue;
    prefabs.add(prefab);
    const missing: number[] = [];
    for (let bitmask = 0; bitmask < CONNECTION_SPRITE_COUNT; bitmask++)
      if (!fs.existsSync(path.join(dir, bitmask + '.png'))) missing.push(bitmask);
    if (missing.length) incomplete.push({ prefab, missing });
  }
  return { prefabs, incomplete };
}

// Canvas-to-cell scale for a connectable's sprites. The all-connected state (15) is flush
// on every side, so its alpha bounding box is exactly one cell; canvas/cell gives the factor
// the renderer must apply (with a center anchor) so the cell maps to one tile and tiles join
// flush. Tiles measure ~1.5, utilities ~1.05-1.15, RocketEnvelopeWindowTile 1.0.
function measureConnectionScale(
  connectionDir: string,
  prefab: string
): { x: number; y: number } {
  const file = path.join(connectionDir, prefab, '15.png');
  if (!fs.existsSync(file)) return { x: 1, y: 1 };
  const img = new Image();
  img.src = fs.readFileSync(file);
  const W = img.width;
  const H = img.height;
  if (!W || !H) return { x: 1, y: 1 };
  const ctx = createCanvas(W, H).getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return { x: 1, y: 1 };
  return { x: W / (maxX - minX + 1), y: H / (maxY - minY + 1) };
}

export function convertExport2024(opts: ConvertOptions): void {
  const dbDir = path.join(opts.exportDir, 'database');
  const uiImageDir = path.join(opts.exportDir, 'ui_image');
  const connectionDir = path.join(opts.exportDir, 'connection_sprites');

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

  const { prefabs: connectablePrefabs, incomplete: incompleteConnectionDirs } =
    readConnectablePrefabs(connectionDir);

  // --- Validation accumulators ---
  const unknownViewModes = new Set<string>();
  const missingIcons: string[] = [];
  const missingUiSpriteInfo: string[] = [];
  const missingMenuBuildings: string[] = [];
  const missingCategories: string[] = [];
  const connectablesNotTileOrUtility: string[] = [];
  const connectablePrefabsSeen = new Set<string>();

  // --- Buildings + per-building flat-icon sprite metadata ---
  const buildings: any[] = [];
  const uiSprites: any[] = [];
  const buildingPrefabs = new Set<string>();

  for (const b of buildingFile.bBuildingDefList) {
    buildingPrefabs.add(b.name);

    const iconKey = b.name; // flat icon = ui_image/<prefabKey>.png
    if (!uiImageFiles.has(iconKey)) missingIcons.push(b.name);
    if (!uiSpriteInfos[iconKey]) missingUiSpriteInfo.push(b.name);

    const connectable = connectablePrefabs.has(b.name);
    const connectionScale = connectable
      ? measureConnectionScale(connectionDir, b.name)
      : { x: 1, y: 1 };
    if (connectable) {
      connectablePrefabsSeen.add(b.name);
      // The editor instantiates connectables as BlueprintItemWire (isUtility) or
      // BlueprintItemTile (isTile). Anything else has no per-mask render hook.
      if (!b.isUtility && !(b.isFoundation || b.isKAnimTile))
        connectablesNotTileOrUtility.push(b.name);
    }

    buildings.push(buildingRecord(b, unknownViewModes, connectable, connectionScale));

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
    icon: e.id,
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
  console.log('  connectable buildings (sprite dirs):', connectablePrefabsSeen.size);
  const connectableDirsNoBuilding = [...connectablePrefabs].filter(
    (p) => !connectablePrefabsSeen.has(p)
  );
  console.log(
    '  connection dirs with no building   :',
    connectableDirsNoBuilding.length,
    connectableDirsNoBuilding.length ? '(' + connectableDirsNoBuilding.join(', ') + ')' : ''
  );
  console.log(
    '  connectables not tile/utility      :',
    connectablesNotTileOrUtility.length,
    connectablesNotTileOrUtility.length ? '(' + connectablesNotTileOrUtility.join(', ') + ')' : ''
  );
  console.log(
    '  connection dirs missing bitmasks   :',
    incompleteConnectionDirs.length,
    incompleteConnectionDirs.length
      ? '(' +
          incompleteConnectionDirs.map((d) => d.prefab + ':' + d.missing.join('/')).join(', ') +
          ')'
      : ''
  );

  // Signal incomplete imports with a non-zero exit so a re-import can be trusted
  // (assets are still written below so you can inspect them).
  const problems =
    missingIcons.length +
    missingUiSpriteInfo.length +
    missingMenuBuildings.length +
    missingCategories.length +
    connectablesNotTileOrUtility.length +
    incompleteConnectionDirs.length +
    connectableDirsNoBuilding.length +
    unknownViewModes.size;
  if (problems > 0) {
    console.log('--- import completed WITH WARNINGS:', problems, 'issue(s) above ---');
    process.exitCode = 1;
  }

  if (opts.dryRun) {
    console.log('--- dry-run: no file written ---');
    return;
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const jsonBytes = Buffer.from(JSON.stringify(database));
  fs.writeFileSync(opts.out, jsonBytes);
  console.log('--- wrote', opts.out, '---');

  // Rebuild both zip files. The internal entry is always named "database.json"
  // because the frontend reads zipped.files["database.json"].
  const zipPaths = [
    path.join(path.dirname(opts.out), 'database-2024.zip'),
    path.join(path.dirname(opts.out), '../../frontend/src/assets/database/database-2024.zip'),
  ];
  for (const zipPath of zipPaths) {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    const z = new AdmZip();
    z.addFile('database.json', jsonBytes);
    z.writeZip(zipPath);
    console.log('--- wrote', path.normalize(zipPath), '---');
  }

  // Sync sprites into the served asset dirs (backend + frontend). The DB references
  // these by filename, so they must travel together with the regenerated JSON.
  const assetDir = path.dirname(opts.out); // assets/database
  syncAssetDir(
    uiImageDir,
    [
      path.join(assetDir, '../ui_image'),
      path.join(assetDir, '../../frontend/src/assets/ui_image'),
    ],
    'ui_image'
  );
  syncAssetDir(
    connectionDir,
    [
      path.join(assetDir, '../connection_sprites'),
      path.join(assetDir, '../../frontend/src/assets/connection_sprites'),
    ],
    'connection_sprites'
  );
  // ui_image_facade/ is intentionally NOT synced: 988 facade/permit PNGs that no
  // current code path references. To enable, add a syncAssetDir call for
  // path.join(opts.exportDir, 'ui_image_facade') -> assets/ui_image_facade (+ frontend).
}

function buildingRecord(
  b: BBuildingDef2024,
  unknownViewModes: Set<string>,
  connectable: boolean,
  connectionScale: { x: number; y: number }
): any {
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
    connectionSprites: connectable,
    connectionScale,
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
