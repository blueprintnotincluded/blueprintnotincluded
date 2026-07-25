// Import pipeline: OniExtract2024 (13-file export) -> the website's consolidated
// `database-2024.json` + all served sprite assets. This is the single repeatable
// step to run after dropping a fresh export into ./export (see `npm run import:2024`).
//
// What it does, end to end:
//   1. Reads the 13 JSONs from export/database/ and maps them to the website shape.
//   2. Writes the consolidated database-2024.json into BOTH asset roots (backend
//      assets/database/ + frontend/src/assets/database/). The loose JSON is the only
//      committed runtime DB artifact — readable diffs, no opaque zip churn. The
//      frontend regenerates its database-2024.zip from this JSON at build/serve time
//      (frontend prebuild/prestart); the backend reads the JSON directly. This script
//      emits no .zip (both .zip paths are gitignored build derivatives).
//   3. Syncs export/ui_image/ and export/connection_sprites/ into both asset roots,
//      content-aware: only files whose bytes actually changed are rewritten and only
//      removed files are pruned, so unchanged icons keep their mtime (no churn).
//   4. Flattens export/database/po_string.json into the frontend's English game-string
//      map (frontend/src/assets/strings/strings.json) — the display names the website
//      resolves element/building/category ids against. Without this, freshly added
//      elements render their raw `<link=...>` markup in the build menu.
//   5. Prints a validation report (missing icons, incomplete connection dirs, etc.).
//
// Rationale (see convert-export-2024.md beside this file): rather than rewrite the three
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
//     --strings-only       regenerate only frontend strings.json; skip the DB rebuild
//                          and the ui_image/connection_sprites sync (leaves them untouched)

import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, Image } from 'canvas';
import {
  BBuildingFile2024,
  BElementsFile2024,
  BUiSpriteInfoFile2024,
  BBuildingDef2024,
  BPoStringFile2024,
} from '../../../lib';
import { Overlay } from '../../../lib/src/enums/overlay';
import { ElementState } from '../../../lib/src/enums/element-state';
import {
  ROOM_BOUNDARY_DOORS,
  ROOM_TAGS_USED,
} from '../../../lib/src/blueprint/rooms/room-definitions';

// ---------------------------------------------------------------------------
// viewMode (game-native overlay name) -> Overlay enum.
// U59 emits `viewMode` as the overlay's name string (e.g. "Power", "GasConduit")
// or null when the building has no special overlay — NOT the old Klei HashedString
// hex. Map each name to the website's Overlay enum; null/"" -> Base.
// ---------------------------------------------------------------------------
const VIEW_MODE_TO_OVERLAY: { [name: string]: Overlay } = {
  Power: Overlay.Power,
  LiquidConduit: Overlay.Liquid,
  GasConduit: Overlay.Gas,
  Logic: Overlay.Automation,
  Oxygen: Overlay.Oxygen,
  SolidConveyor: Overlay.Conveyor,
  Decor: Overlay.Decor,
  Light: Overlay.Light,
  Temperature: Overlay.Temperature,
  Rooms: Overlay.Room,
  Radiation: Overlay.Unknown, // real game overlay, no dedicated website overlay
  Disease: Overlay.Unknown, // mapping exists game-side; unseen in this build
  Crop: Overlay.Unknown, // ditto
};

// The 8 utility-overlay port indicators, by id (== their ui_image/<name>.png filename and
// the id ConnectionHelper.getConnectionSprite resolves). Shipped as flat PNGs since U59.
const UTILITY_INDICATOR_NAMES = [
  'input',
  'output',
  'electrical_disconnected',
  'logicInput',
  'logicOutput',
  'logicResetUpdate',
  'logic_ribbon_all_in',
  'logic_ribbon_all_out',
];

function overlayFromViewMode(viewMode: string | null, unknown: Set<string>): Overlay {
  if (viewMode == null || viewMode === '') return Overlay.Base; // no special overlay
  const mapped = VIEW_MODE_TO_OVERLAY[viewMode];
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
  stringsOnly: boolean;
}

function parseArgs(argv: string[]): ConvertOptions {
  const opts: ConvertOptions = {
    exportDir: 'export',
    out: 'assets/database/database-2024.json',
    dryRun: false,
    stringsOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--strings-only') opts.stringsOnly = true;
    else if (a === '--export-dir') opts.exportDir = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
  }
  return opts;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

// True when dest is missing or its bytes differ from src. Size check first (cheap),
// then a full byte compare. The export encoder is deterministic, so identical pixels
// yield identical bytes — letting us skip the rewrite and preserve dest's mtime.
function filesDiffer(src: string, dest: string): boolean {
  let destSize: number;
  try {
    destSize = fs.statSync(dest).size;
  } catch {
    return true; // missing
  }
  if (fs.statSync(src).size !== destSize) return true;
  return !fs.readFileSync(src).equals(fs.readFileSync(dest));
}

// The 2024 export is NOT byte-deterministic across game updates: Klei re-rasterizes untouched
// vector art on every build, so a pure byte compare churns hundreds of visually-identical
// sprites on re-import. The noise is always sub-pixel edge jitter — re-rasterization sprays a
// ~1px anti-aliasing halo along every icon edge. On densely-textured sprites (e.g. the
// diamond-mesh doors, or the gas-element blobs) that halo can be thousands of pixels, so a raw
// per-pixel count cannot tell jitter from a real redraw. What CAN: a small Gaussian blur.
// Blurring both images by ~1px averages out the ±1px edge jitter (it collapses to zero) while
// a genuine fill/shape/colour change survives. So the guard premultiplies alpha (matching what
// renders over the dark UI), blurs PNG_BLUR_PASSES times, and counts pixels still differing by
// more than PNG_BLUR_DELTA. Verified across a full game-update import: every re-encode-only
// sprite (all gas overlays + all automation port indicators) collapses to 0 changed pixels,
// while the smallest genuine redraw stays > 2000 — so PNG_MAX_INCIDENTAL_PIXELS sits in an
// enormous gap. Dimension changes and decode failures always count as changed.
const PNG_BLUR_PASSES = 2; // 5-tap Gaussian composed twice ~= sigma 1.2
const PNG_BLUR_DELTA = 12; // per-channel (0-255) on blurred, alpha-premultiplied RGB
const PNG_MAX_INCIDENTAL_PIXELS = 64;

// Decode a PNG to raw RGBA using canvas (already a dependency for connection-scale).
function decodePng(file: string): { w: number; h: number; data: Uint8ClampedArray } {
  const img = new Image();
  img.src = fs.readFileSync(file);
  const w = img.width;
  const h = img.height;
  const ctx = createCanvas(w, h).getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

// One pass of a separable 5-tap Gaussian ([1 4 6 4 1]/16, sigma ~0.85), edge-clamped.
function blurPlane(src: Float32Array, w: number, h: number): Float32Array {
  const k0 = 6 / 16;
  const k1 = 4 / 16;
  const k2 = 1 / 16;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      tmp[r + x] =
        k2 * src[r + Math.max(0, x - 2)] +
        k1 * src[r + Math.max(0, x - 1)] +
        k0 * src[r + x] +
        k1 * src[r + Math.min(w - 1, x + 1)] +
        k2 * src[r + Math.min(w - 1, x + 2)];
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    const m2 = Math.max(0, y - 2) * w;
    const m1 = Math.max(0, y - 1) * w;
    const p1 = Math.min(h - 1, y + 1) * w;
    const p2 = Math.min(h - 1, y + 2) * w;
    for (let x = 0; x < w; x++) {
      out[r + x] =
        k2 * tmp[m2 + x] +
        k1 * tmp[m1 + x] +
        k0 * tmp[r + x] +
        k1 * tmp[p1 + x] +
        k2 * tmp[p2 + x];
    }
  }
  return out;
}

// The three alpha-premultiplied RGB planes of an image, each blurred PNG_BLUR_PASSES times.
function blurredPremultPlanes(img: {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}): [Float32Array, Float32Array, Float32Array] {
  const n = img.w * img.h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const alpha = img.data[i + 3] / 255;
    r[p] = img.data[i] * alpha;
    g[p] = img.data[i + 1] * alpha;
    b[p] = img.data[i + 2] * alpha;
  }
  const planes: [Float32Array, Float32Array, Float32Array] = [r, g, b];
  for (let c = 0; c < 3; c++)
    for (let pass = 0; pass < PNG_BLUR_PASSES; pass++)
      planes[c] = blurPlane(planes[c], img.w, img.h);
  return planes;
}

// True when two PNGs are visually identical: same dimensions and, after alpha-premultiplying
// and blurring both, at most PNG_MAX_INCIDENTAL_PIXELS pixels still differ by more than
// PNG_BLUR_DELTA on any channel. The blur absorbs sub-pixel edge jitter; genuine art changes
// survive it. Any decode failure or dimension change returns false (treat as changed, so we
// never silently drop a real update).
function pngVisuallyEqual(src: string, dest: string): boolean {
  let a: { w: number; h: number; data: Uint8ClampedArray };
  let b: { w: number; h: number; data: Uint8ClampedArray };
  try {
    a = decodePng(src);
    b = decodePng(dest);
  } catch {
    return false;
  }
  if (!a.w || !a.h || a.w !== b.w || a.h !== b.h) return false;
  const [ar, ag, ab] = blurredPremultPlanes(a);
  const [br, bg, bb] = blurredPremultPlanes(b);
  let changed = 0;
  for (let p = 0; p < ar.length; p++) {
    const d = Math.max(
      Math.abs(ar[p] - br[p]),
      Math.abs(ag[p] - bg[p]),
      Math.abs(ab[p] - bb[p])
    );
    if (d > PNG_BLUR_DELTA && ++changed > PNG_MAX_INCIDENTAL_PIXELS) return false;
  }
  return true;
}

type SpriteVerdict = 'identical' | 'preserved' | 'changed';

// Decide whether a synced sprite should be rewritten. Byte-identical files are 'identical'
// (skip, keep mtime). PNGs whose bytes changed but whose pixels are visually identical are
// 'preserved' (keep the committed file, so re-import doesn't churn on export re-encode
// jitter). Everything else is 'changed' and gets copied.
function classifySprite(src: string, dest: string): SpriteVerdict {
  if (!filesDiffer(src, dest)) return 'identical';
  if (dest.toLowerCase().endsWith('.png') && pngVisuallyEqual(src, dest)) return 'preserved';
  return 'changed';
}

interface MirrorStats {
  copied: number;
  skipped: number;
  preserved: number;
  removed: number;
}

// Mirror src -> dest content-aware (fs.cpSync is unavailable in the backend's
// @types/node): write a file only when missing or its bytes differ, and delete
// anything in dest no longer present in src. Unchanged files keep their mtime, so
// re-imports don't churn the asset tree and mtime stays a reliable "changed" signal.
function mirrorDir(src: string, dest: string, stats: MirrorStats): void {
  fs.mkdirSync(dest, { recursive: true });
  const srcEntries = fs.readdirSync(src, { withFileTypes: true });
  const srcNames = new Set(srcEntries.map((e) => e.name));

  // Prune dest entries the source no longer has.
  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    if (srcNames.has(entry.name)) continue;
    fs.rmSync(path.join(dest, entry.name), { recursive: true, force: true });
    stats.removed++;
  }

  for (const entry of srcEntries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      // Clear a same-named file before descending (type changed src->dest).
      if (fs.existsSync(destPath) && !fs.statSync(destPath).isDirectory())
        fs.rmSync(destPath, { force: true });
      mirrorDir(srcPath, destPath, stats);
    } else {
      // Clear a same-named dir before writing a file (type changed src->dest).
      if (fs.existsSync(destPath) && fs.statSync(destPath).isDirectory())
        fs.rmSync(destPath, { recursive: true, force: true });
      switch (classifySprite(srcPath, destPath)) {
        case 'changed':
          fs.copyFileSync(srcPath, destPath);
          stats.copied++;
          break;
        case 'preserved':
          stats.preserved++;
          break;
        default:
          stats.skipped++;
      }
    }
  }
}

// Mirror an export sub-folder into each served asset root. No-op if src is absent.
function syncAssetDir(src: string, targets: string[], label: string): void {
  if (!fs.existsSync(src)) {
    console.log('--- skipped', label, '(not in export) ---');
    return;
  }
  for (const target of targets) {
    const stats: MirrorStats = { copied: 0, skipped: 0, preserved: 0, removed: 0 };
    mirrorDir(src, target, stats);
    console.log(
      '--- synced',
      label,
      '->',
      path.normalize(target),
      `(updated ${stats.copied}, unchanged ${stats.skipped}, ` +
        `preserved ${stats.preserved} re-encoded, removed ${stats.removed}) ---`
    );
  }
}

// Write bytes only when the target is missing or its content changed, so an
// unchanged JSON keeps its mtime. Returns true if it actually wrote.
function writeFileIfChanged(file: string, bytes: Buffer): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (fs.readFileSync(file).equals(bytes)) return false;
  } catch {
    /* missing -> write */
  }
  fs.writeFileSync(file, bytes);
  return true;
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

// English game strings: flatten po_string.json into the flat lookup the website's
// GameStringService consumes. The export groups strings by top-level category
// (ELEMENTS, BUILDINGS, UI, ...) and keys them by their full dotted id
// (e.g. "ELEMENTS.MOLTENZINC.NAME"); the website queries them under a "STRINGS."
// prefix (e.g. "STRINGS.ELEMENTS.MOLTENZINC.NAME"), so prepend it here. Values keep
// their Klei rich-text markup (<link=...> etc.) — the service strips it at load time.
// Object-valued entries are the category dicts; the BExport2024Meta scalars
// (buildVersion, dlcs, ...) sit at the same level and are skipped.
function buildEnglishStrings(poStringFile: string): Record<string, string> {
  const raw = readJson<BPoStringFile2024>(poStringFile);
  const strings: Record<string, string> = {};
  for (const section of Object.values(raw)) {
    if (section === null || typeof section !== 'object' || Array.isArray(section)) continue;
    for (const [key, value] of Object.entries(section))
      if (typeof value === 'string') strings['STRINGS.' + key] = value;
  }
  return strings;
}

// Write the English game strings -> frontend only (strings are not used server-side).
// Pretty-print so git shows real string diffs. `outBase` is the --out database path; the
// strings dir is resolved relative to it (../../frontend/src/assets/strings).
function writeEnglishStrings(strings: Record<string, string>, outBase: string): void {
  const stringsBytes = Buffer.from(JSON.stringify(strings, null, 2) + '\n');
  const stringsTarget = path.join(
    path.dirname(outBase),
    '../../frontend/src/assets/strings/strings.json'
  );
  const changed = writeFileIfChanged(stringsTarget, stringsBytes);
  console.log('---', changed ? 'wrote' : 'unchanged', path.normalize(stringsTarget), '---');
}

export function convertExport2024(opts: ConvertOptions): void {
  const dbDir = path.join(opts.exportDir, 'database');
  const uiImageDir = path.join(opts.exportDir, 'ui_image');
  const connectionDir = path.join(opts.exportDir, 'connection_sprites');

  // English game strings (element/building/category names, overlay labels). The website
  // resolves rich-text display names against this map at load time; without it, new
  // elements fall back to their raw `<link=...>` markup in the build menu.
  const poStringFile = path.join(dbDir, 'po_string.json');
  const hasPoStrings = fs.existsSync(poStringFile);
  const englishStrings = hasPoStrings ? buildEnglishStrings(poStringFile) : {};

  // --strings-only: regenerate just strings.json. Skips the DB rebuild and the
  // content-aware sprite sync entirely (no touching ui_image/ or connection_sprites/).
  if (opts.stringsOnly) {
    console.log('convert-export-2024 (strings only)');
    console.log('  english strings        :', Object.keys(englishStrings).length);
    console.log('  po_string.json present :', hasPoStrings);
    if (!hasPoStrings) {
      console.log('--- po_string.json missing — nothing written ---');
      process.exitCode = 1;
      return;
    }
    if (opts.dryRun) {
      console.log('--- dry-run: no file written ---');
      return;
    }
    writeEnglishStrings(englishStrings, opts.out);
    return;
  }

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
  const unknownConnectionTypes = new Set<string>();
  const missingIcons: string[] = [];
  const missingUiSpriteInfo: string[] = [];
  const missingMenuBuildings: string[] = [];
  const missingCategories: string[] = [];
  const connectablesNotTileOrUtility: string[] = [];
  const connectablePrefabsSeen = new Set<string>();

  // Room-system tag vocabulary — the same list the game's RoomProber uses.
  const roomTagVocabulary = new Set((buildingFile.roomConstraintTags ?? []).map((t) => t.Name));

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

    buildings.push(
      buildingRecord(
        b,
        unknownViewModes,
        connectable,
        connectionScale,
        unknownConnectionTypes,
        roomTagVocabulary
      )
    );

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

  // --- Mods index: distinct `mod` values across bBuildingDefList (NOT the root
  // `mods` roster, which is metadata-only — see spec/WEBSITE_MOD_IMPORT.md §2). ---
  const modsById = new Map<string, { id: string; title: string; buildings: string[] }>();
  for (const b of buildingFile.bBuildingDefList) {
    if (!b.mod) continue;
    const entry = modsById.get(b.mod) ?? { id: b.mod, title: b.modTitle ?? b.mod, buildings: [] };
    entry.buildings.push(b.name);
    modsById.set(b.mod, entry);
  }
  const mods = [...modsById.values()]
    .map((m) => ({ ...m, buildings: [...m.buildings].sort() }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // --- Elements: elementTable dict -> array ---
  // maxMass/defaultMass/defaultTemperature are the game's own load-time defaults; the
  // website seeds its mass and temperature pickers from them instead of the single
  // hardcoded constant it used to apply to every element. lowTemp/highTemp come along
  // because they bound the temperature picker. Masses are kg, temperatures Kelvin.
  const unknownElementStates = new Set<string>();
  const elements = Object.values(elementsFile.elementTable).map((e) => ({
    name: e.name,
    id: e.id,
    tag: e.tag,
    oreTags: e.oreTags ?? [],
    state: parseElementState(e.state, unknownElementStates),
    buildMenuSort: e.buildMenuSort,
    color: e.color,
    conduitColor: e.conduitColor,
    uiColor: e.uiColor,
    icon: e.id,
    maxMass: e.maxMass,
    defaultMass: e.defaultMass,
    defaultTemperature: e.defaultTemperature,
    lowTemp: e.lowTemp,
    highTemp: e.highTemp,
  }));

  // Element default invariants, per the export contract. Both are cheap and catch a
  // whole class of upstream regression: if the exporter ever reads gas.yaml instead of
  // the runtime Element, gases lose their 1.8/1.0 runtime defaults and every gas mass
  // picker silently goes wrong.
  const elementsMissingDefaults = elements.filter(
    (e) =>
      !Number.isFinite(e.maxMass) ||
      !Number.isFinite(e.defaultMass) ||
      !Number.isFinite(e.defaultTemperature)
  );
  const gasElements = elements.filter((e) => e.state === ElementState.Gas);
  const gasesWithoutRuntimeDefaults = gasElements.filter(
    (e) => e.maxMass !== GAS_MAX_MASS || e.defaultMass !== GAS_DEFAULT_MASS
  );
  const elementsOverMaxMass = elements.filter((e) => e.defaultMass > e.maxMass);

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
    { name: 'gas_tile_front', textureName: 'gas_tile_front', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'liquid_tile_front', textureName: 'liquid_tile_front', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'vacuum_tile_front', textureName: 'vacuum_tile_front', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    { name: 'info_back', textureName: 'info_back', isIcon: false, isInputOutput: false, uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 } },
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `info_front_${i}`, textureName: `info_front_${i}`, isIcon: false, isInputOutput: false,
      uvMin: { x: 0, y: 0 }, uvSize: { x: 128, y: 128 }, realSize: { x: 100, y: 100 }, pivot: { x: 1, y: 0 },
    })),
  ];

  // Utility-overlay port indicators drawn by ConnectionHelper.getConnectionSprite (resolved
  // directly by id, no spriteModifier; tint applied at draw time). U59 now ships these as their
  // own flat PNGs in export/ui_image/, so we register each as a whole-image sprite (uvMin 0,0,
  // uvSize = the PNG's real size) instead of slicing the legacy packed-atlas pages we used to
  // depend on. drawPixiUtility forces a fixed 0.5×0.5-cell draw size, so the icons render exactly
  // as before. The PNGs are copied into the SpriteInfo image root (frontend/src/assets/images/)
  // below — SpriteInfo resolves textureName there, not in ui_image/.
  const indicatorSprites = UTILITY_INDICATOR_NAMES.map((name) => {
    const size = readPngSize(path.join(uiImageDir, name + '.png')) ?? { x: 0, y: 0 };
    return {
      name, textureName: name, isIcon: true, isInputOutput: true,
      uvMin: { x: 0, y: 0 }, uvSize: { x: size.x, y: size.y },
      realSize: { x: size.x, y: size.y }, pivot: { x: 0.5, y: 0.5 },
    };
  });
  // Fail the import if the export is missing any indicator PNG — the DB would otherwise
  // reference a texture that won't resolve and every utility overlay would go blank.
  const imagesDir = path.join(path.dirname(opts.out), '../../frontend/src/assets/images');
  const missingIndicatorPngs = UTILITY_INDICATOR_NAMES.filter((n) => !uiImageFiles.has(n));

  const overlayModifiers = [
    { name: 'element_tile_back', spriteInfoName: 'element_tile_back', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [27] },
    { name: 'gas_tile_front', spriteInfoName: 'gas_tile_front', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [28] },
    { name: 'liquid_tile_front', spriteInfoName: 'liquid_tile_front', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [29] },
    { name: 'vacuum_tile_front', spriteInfoName: 'vacuum_tile_front', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [30] },
    { name: 'info_back', spriteInfoName: 'info_back', translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [31] },
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `info_front_${i}`, spriteInfoName: `info_front_${i}`, translation: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, tags: [32],
    })),
  ];

  const database = {
    buildings,
    uiSprites: [...uiSprites, ...overlayUiSprites, ...indicatorSprites],
    spriteModifiers: overlayModifiers,
    buildMenuCategories,
    buildMenuItems,
    elements,
    mods,
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
  console.log('  english strings    :', Object.keys(englishStrings).length);
  console.log(
    '  modded buildings   :',
    buildings.filter((b) => b.mod).length,
    'from',
    mods.length,
    'mods'
  );
  console.log('--- validation ---');
  console.log('  po_string.json present             :', hasPoStrings);
  console.log(
    '  elements by state                  :',
    `${gasElements.length} gas,`,
    `${elements.filter((e) => e.state === ElementState.Liquid).length} liquid,`,
    `${elements.filter((e) => e.state === ElementState.Solid).length} solid,`,
    `${elements.filter((e) => e.state === ElementState.Vacuum).length} vacuum`
  );
  console.log(
    '  unknown element states             :',
    unknownElementStates.size,
    unknownElementStates.size ? '(' + [...unknownElementStates].join(', ') + ')' : ''
  );
  console.log(
    '  elements missing mass/temp defaults:',
    elementsMissingDefaults.length,
    elementsMissingDefaults.length
      ? '(' + elementsMissingDefaults.slice(0, 30).map((e) => e.id).join(', ') + ')'
      : ''
  );
  console.log(
    '  gases without runtime mass defaults:',
    gasesWithoutRuntimeDefaults.length,
    gasesWithoutRuntimeDefaults.length
      ? '(exporter read gas.yaml, not the runtime Element: ' +
      gasesWithoutRuntimeDefaults.slice(0, 30).map((e) => e.id).join(', ') +
      ')'
      : ''
  );
  console.log(
    '  elements with defaultMass > maxMass:',
    elementsOverMaxMass.length,
    elementsOverMaxMass.length
      ? '(' + elementsOverMaxMass.slice(0, 30).map((e) => e.id).join(', ') + ')'
      : ''
  );
  console.log('  utility indicator PNGs missing     :', missingIndicatorPngs.length);
  if (missingIndicatorPngs.length)
    console.log('    missing from export/ui_image (utility overlays will be broken):', missingIndicatorPngs.join(', '));
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
    '  unknown viewMode names             :',
    unknownViewModes.size,
    unknownViewModes.size ? '(' + [...unknownViewModes].join(', ') + ')' : ''
  );
  console.log(
    '  buildings with utility ports       :',
    buildings.filter((b) => b.utilities && b.utilities.length).length,
    '/',
    buildings.length
  );
  console.log(
    '  unknown connection types           :',
    unknownConnectionTypes.size,
    unknownConnectionTypes.size ? '(' + [...unknownConnectionTypes].join(', ') + ')' : ''
  );
  console.log(
    '  buildings with uiImageRect placement:',
    buildings.filter((b) => b.uiImageRect).length,
    '/',
    buildings.length,
    '(rest stretch icon to footprint)'
  );
  // Room detection contract: every tag the rule table references must map to at
  // least one building, and every curated boundary door must exist — otherwise a
  // future export silently breaks room detection (e.g. Klei renames a tag).
  const roomTagBuildingCounts = new Map<string, number>(ROOM_TAGS_USED.map((t) => [t, 0]));
  for (const b of buildings)
    for (const tag of b.roomTags)
      if (roomTagBuildingCounts.has(tag))
        roomTagBuildingCounts.set(tag, roomTagBuildingCounts.get(tag)! + 1);
  const roomTagsUnmatched = ROOM_TAGS_USED.filter((t) => roomTagBuildingCounts.get(t) === 0);
  const roomTagsNotInVocabulary = ROOM_TAGS_USED.filter((t) => !roomTagVocabulary.has(t));
  const roomDoorsMissing = [...ROOM_BOUNDARY_DOORS].filter((d) => !buildingPrefabs.has(d));
  console.log(
    '  buildings with room tags           :',
    buildings.filter((b) => b.roomTags.length).length,
    '/',
    buildings.length
  );
  console.log(
    '  room tags with no building         :',
    roomTagsUnmatched.length,
    roomTagsUnmatched.length ? '(' + roomTagsUnmatched.join(', ') + ')' : ''
  );
  console.log(
    '  room tags missing from vocabulary  :',
    roomTagsNotInVocabulary.length,
    roomTagsNotInVocabulary.length ? '(' + roomTagsNotInVocabulary.join(', ') + ')' : ''
  );
  console.log(
    '  room boundary doors missing        :',
    roomDoorsMissing.length,
    roomDoorsMissing.length ? '(' + roomDoorsMissing.join(', ') + ')' : ''
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
    unknownViewModes.size +
    unknownConnectionTypes.size +
    missingIndicatorPngs.length +
    roomTagsUnmatched.length +
    roomTagsNotInVocabulary.length +
    roomDoorsMissing.length +
    unknownElementStates.size +
    elementsMissingDefaults.length +
    gasesWithoutRuntimeDefaults.length +
    elementsOverMaxMass.length +
    (hasPoStrings ? 0 : 1);
  if (problems > 0) {
    console.log('--- import completed WITH WARNINGS:', problems, 'issue(s) above ---');
    process.exitCode = 1;
  }

  if (opts.dryRun) {
    console.log('--- dry-run: no file written ---');
    return;
  }

  // The committed runtime artifact is the loose JSON, written to BOTH asset roots:
  // the backend reads it directly at startup, and the frontend build/serve step zips
  // it into the gitignored database-2024.zip the Angular app fetches. No .zip is
  // emitted here (see frontend prebuild/prestart).
  // Pretty-print (2-space) so git diffs are line-oriented: a small data change
  // touches a few lines, not the whole file. Minifying would make every edit a
  // full-file replace, defeating the point of committing JSON over the zip.
  const jsonBytes = Buffer.from(JSON.stringify(database, null, 2) + '\n');
  const jsonTargets = [
    opts.out,
    path.join(path.dirname(opts.out), '../../frontend/src/assets/database/database-2024.json'),
  ];
  for (const target of jsonTargets) {
    const changed = writeFileIfChanged(target, jsonBytes);
    console.log('---', changed ? 'wrote' : 'unchanged', path.normalize(target), '---');
  }

  // English game strings -> frontend only. Skipped when po_string.json is absent.
  if (hasPoStrings) writeEnglishStrings(englishStrings, opts.out);

  // Utility-overlay indicator PNGs -> the SpriteInfo image root (frontend/src/assets/images/).
  // SpriteInfo resolves textureName under assets/images/, not ui_image/, so the indicator
  // sprites registered above need their PNG here (the backend renderer reads the same root).
  // Content-aware so unchanged icons keep their mtime.
  fs.mkdirSync(imagesDir, { recursive: true });
  let indicatorsCopied = 0;
  for (const name of UTILITY_INDICATOR_NAMES) {
    const src = path.join(uiImageDir, name + '.png');
    const dest = path.join(imagesDir, name + '.png');
    if (fs.existsSync(src) && classifySprite(src, dest) === 'changed') {
      fs.copyFileSync(src, dest);
      indicatorsCopied++;
    }
  }
  console.log(
    '--- synced utility indicators ->',
    path.normalize(imagesDir),
    `(updated ${indicatorsCopied}/${UTILITY_INDICATOR_NAMES.length}) ---`
  );

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

function normalizeDlcIds(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  return raw.filter(Boolean);
}

// Element.State as emitted by the export -> ElementState int (lib/src/enums/element-state.ts).
// Same quirk as ConnectionType below, but only half the time: the export writes the enum's
// *name* for most solids ('Solid') and its raw numeric value for everything else ('5', '6',
// '20'). The numeric value carries flag bits above the phase, so the low 2 bits are the
// phase and the rest are masked off — that resolves all 212 U59 elements (32 gas, 52 liquid,
// 125 solid, 3 vacuum) and matches the 32 gases the export contract documents.
const ELEMENT_STATE_MASK = 3;

// ElementLoader.CopyEntryToElement applies these to every gas at load time, because
// gas.yaml ships without them. They are constants of the game, not of any one element.
const GAS_MAX_MASS = 1.8;
const GAS_DEFAULT_MASS = 1.0;

const ELEMENT_STATE_BY_NAME: { [name: string]: number } = {
  Vacuum: ElementState.Vacuum,
  Gas: ElementState.Gas,
  Liquid: ElementState.Liquid,
  Solid: ElementState.Solid,
};

function parseElementState(raw: string, unknown: Set<string>): number {
  const named = ELEMENT_STATE_BY_NAME[raw];
  if (named !== undefined) return named;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    unknown.add(raw);
    return ElementState.Vacuum;
  }
  return numeric & ELEMENT_STATE_MASK;
}

// ConnectionType enum member name (as emitted by the U59 export) -> ConnectionType int
// (lib/src/enums/connection-type.ts). The export omits NONE(10) and LogicControlInput(12);
// MUX/DEMUX selector ports come through as plain "LogicInput". Offsets need no transform —
// the export's CellOffset convention already matches the website's internal coordinates.
const CONNECTION_TYPE_BY_NAME: { [name: string]: number } = {
  PowerInput: 0,
  PowerOutput: 1,
  GasInput: 2,
  GasOutput: 3,
  LiquidInput: 4,
  LiquidOutput: 5,
  LogicInput: 6,
  LogicOutput: 7,
  SolidInput: 8,
  SolidOutput: 9,
  LogicReset: 11,
  LogicRibbonInput: 13,
  LogicRibbonOutput: 14,
};

// Map the export's `utilities` array to the internal { type:int, offset, isSecondary } shape.
// Drops any port whose type name is unrecognised (none in U59) or whose offset is missing
// (none in U59 — null offsets were eliminated upstream), recording unknowns in the set.
function utilitiesRecord(
  b: BBuildingDef2024,
  unknownConnectionTypes: Set<string>
): { offset: { x: number; y: number }; type: number; isSecondary: boolean }[] {
  const result: { offset: { x: number; y: number }; type: number; isSecondary: boolean }[] = [];
  for (const u of b.utilities ?? []) {
    const type = CONNECTION_TYPE_BY_NAME[u.type];
    if (type === undefined) {
      unknownConnectionTypes.add(u.type);
      continue;
    }
    if (!u.offset) continue;
    result.push({
      offset: { x: u.offset.x, y: u.offset.y },
      type,
      isSecondary: !!u.isSecondary,
    });
  }
  return result;
}

// Intersection of the building's game tags with the export's roomConstraintTags
// vocabulary — the building's role(s) in the game's room system. Sorted so the
// committed JSON is deterministic.
function roomTagsRecord(b: BBuildingDef2024, roomTagVocabulary: Set<string>): string[] {
  return (b.tags ?? [])
    .map((t) => t.Name)
    .filter((name) => roomTagVocabulary.has(name))
    .sort();
}

function buildingRecord(
  b: BBuildingDef2024,
  unknownViewModes: Set<string>,
  connectable: boolean,
  connectionScale: { x: number; y: number },
  unknownConnectionTypes: Set<string>,
  roomTagVocabulary: Set<string>
): any {
  return {
    DefaultAnimState: b.defaultAnimState,
    name: b.nameString, // rich-text display name (legacy stored rich-text here too)
    prefabId: b.name, // plain id / lookup key
    kanimPrefix: b.name + '_',
    textureName: b.name, // flat-icon key -> ui_image/<key>.png
    uiImage: b.name, // explicit flat-icon reference for the render-collapse phase
    isTile: b.isFoundation || b.isKAnimTile,
    // Kept separate from the render-oriented isTile: only true foundations bound
    // rooms (isKAnimTile alone marks wires/pipes, which must not).
    isFoundation: b.isFoundation,
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
    dlcIds: normalizeDlcIds(b.kPrefabID?.requiredDlcIds),
    roomTags: roomTagsRecord(b, roomTagVocabulary),
    ...(b.mod ? { mod: b.mod, modTitle: b.modTitle } : {}),
    ...(b.offlineMerged ? { offlineMerged: true } : {}),
    // Optional flat-icon placement (cells, footprint-relative). Passed through from the
    // export when present; absent ⇒ renderer stretches the icon to the footprint (legacy).
    ...(b.uiImageRect ? { uiImageRect: b.uiImageRect } : {}),
    buildLocationRule: b.buildLocationRule,
    utilities: utilitiesRecord(b, unknownConnectionTypes),
    ...(b.areasOfEffect?.length ? { areasOfEffect: b.areasOfEffect } : {}),
    uiScreens: [],
    sprites: { groupName: 'all sprites', spriteNames: [] }, // flat icon: no atlas sprites
    materialCategory: b.materialCategory ?? [],
    materialMass: b.materialMass ?? [],
  };
}

if (require.main === module) {
  convertExport2024(parseArgs(process.argv.slice(2)));
}
