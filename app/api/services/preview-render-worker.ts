// Standalone child process that renders blueprint preview images with the
// node Canvas + PIXI stack. Runs out-of-process because pixi-shim installs
// DOM globals and decoded textures accumulate RSS — neither belongs in the
// API process. Textures are loaded per render (only the ids the blueprint
// references): preloading the full registered set costs ~400MB RSS, which
// OOM-killed the whole container on small prod instances. Spawned lazily by
// PreviewImageService and killed again after an idle period.
//
// IPC protocol (all messages JSON over process.send):
//   parent -> worker: { type: 'render', requestId, mdb, size }
//   worker -> parent: { type: 'ready' }
//                     { type: 'rendered', requestId, pngBase64 }
//                     { type: 'error', requestId, message }
//
// CLI: `node preview-render-worker.js --smoke` renders a built-in fixture and
// exits 0/1 — run inside the deploy image to validate native deps + assets.
import * as fs from 'fs';
import * as path from 'path';

import {
  Blueprint as SharedBlueprint,
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
  Vector2,
  CameraService,
  ConnectionHelper,
  Overlay,
  Display,
} from '../../../lib';
import { PixiNodeUtil } from '../pixi-node-util';

const REPO_ROOT = path.resolve(__dirname, '../../..');

// The renderer resolves the relative asset urls the shared lib registers
// ('assets/ui_image/…', 'assets/images/…', 'assets/connection_sprites/…').
// Only the frontend asset root carries the complete set (the backend
// `assets/` root lacks `images/`): in the production container that is the
// built frontend at app/public, in a dev checkout it is frontend/src.
function resolveAssetBaseDir(): string {
  const candidates = [path.join(REPO_ROOT, 'app/public'), path.join(REPO_ROOT, 'frontend/src')];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'assets/images'))) return candidate;
  }
  throw new Error(
    'preview-render-worker: no asset root with assets/images found (looked in app/public, frontend/src)'
  );
}

function initSharedLib() {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'assets/database/database-2024.json'), 'utf8');
  const json = JSON.parse(raw);

  ImageSource.init();
  BuildableElement.init();
  BuildableElement.load(json.elements as BuildableElement[]);
  BuildMenuCategory.init();
  BuildMenuCategory.load(json.buildMenuCategories as BuildMenuCategory[]);
  BuildMenuItem.init();
  BuildMenuItem.load(json.buildMenuItems as BuildMenuItem[]);
  SpriteInfo.init();
  SpriteInfo.load(json.uiSprites as BSpriteInfo[]);
  SpriteModifier.init();
  SpriteModifier.load(json.spriteModifiers as BSpriteModifier[]);
  OniItem.init();
  OniItem.load(json.buildings as BBuilding[]);
}

function logRss(label: string) {
  const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  console.log(`preview-render-worker: ${label} rss=${rssMb}MB`);
}

// Every image id a render of this blueprint can request. Static walk of the
// texture consumers (DrawPart.prepareSprite, SpriteInfo.getTexture,
// drawPixiUtility) so only these files are decoded — preloading the full
// registered set costs ~400MB RSS and OOM-kills small prod instances.
function collectImageIds(blueprint: SharedBlueprint): Set<string> {
  const imageIds = new Set<string>();
  for (const item of blueprint.blueprintItems) {
    for (const part of item.drawParts) {
      if (part.flatIconId) {
        imageIds.add(part.flatIconId);
      } else if (part.spriteModifier) {
        const spriteInfo = SpriteInfo.getSpriteInfo(part.spriteModifier.spriteInfoName);
        if (spriteInfo?.imageId) imageIds.add(spriteInfo.imageId);
      }
    }
    for (const connection of item.oniItem.utilityConnections ?? []) {
      const connectionSprite = ConnectionHelper.getConnectionSprite(connection);
      const spriteInfo =
        connectionSprite && SpriteInfo.getSpriteInfo(connectionSprite.spriteInfoId);
      if (spriteInfo?.imageId) imageIds.add(spriteInfo.imageId);
    }
  }
  return imageIds;
}

// Decode the given textures if they are not already resident. Missing or
// unregistered files get a 1x1 transparent placeholder instead of failing the
// whole render: node PIXI cannot load textures lazily (sync getBaseTexture),
// and a handful of legacy ui sprites may be absent without affecting
// blueprint rendering. Returns the number of placeholders used.
async function ensureTextures(
  pixi: PixiNodeUtil,
  baseDir: string,
  imageIds: Iterable<string>
): Promise<number> {
  let missing = 0;
  for (const key of imageIds) {
    if (ImageSource.isTextureLoaded(key)) continue;
    try {
      const imageUrl = ImageSource.getUrl(key)!;
      const baseTexture = await pixi.getImageFromCanvas(path.join(baseDir, imageUrl));
      ImageSource.setBaseTexture(key, baseTexture);
    } catch {
      missing++;
      ImageSource.setBaseTexture(key, pixi.getNewBaseRenderTexture({ width: 1, height: 1 }));
    }
  }
  if (missing > 0)
    console.warn(`preview-render-worker: ${missing} textures missing, using placeholders`);
  return missing;
}

// Deterministic fit-to-content framing — same camera rules as the historic
// thumbnail path (~1.5 tiles padding, content centered on a square canvas)
// but without the integer zoom flooring so framing is resolution-independent.
async function renderMaster(
  pixi: PixiNodeUtil,
  assetBaseDir: string,
  mdb: MdbBlueprint,
  size: number
): Promise<string> {
  const blueprint = new SharedBlueprint();
  blueprint.importFromMdb(mdb);
  if (blueprint.blueprintItems.length === 0) throw new Error('empty blueprint');

  await ensureTextures(pixi, assetBaseDir, collectImageIds(blueprint));

  const [topLeft, bottomRight] = blueprint.getBoundingBox();
  const totalTileSize = new Vector2(
    bottomRight.x - topLeft.x + 3,
    bottomRight.y - topLeft.y + 3
  );
  const maxTotalSize = Math.max(totalTileSize.x, totalTileSize.y);
  const tileSize = size / maxTotalSize;
  const cameraOffset = new Vector2(-topLeft.x + 1, bottomRight.y + 1);
  if (totalTileSize.x > totalTileSize.y) cameraOffset.y += totalTileSize.x / 2 - totalTileSize.y / 2;
  if (totalTileSize.y > totalTileSize.x) cameraOffset.x += totalTileSize.y / 2 - totalTileSize.x / 2;

  const exportCamera = new CameraService(pixi.getNewContainer());
  exportCamera.setHardZoom(tileSize);
  exportCamera.cameraOffset = cameraOffset;
  exportCamera.overlay = Overlay.Base;
  exportCamera.display = Display.solid;
  exportCamera.container = pixi.getNewContainer();
  exportCamera.container.sortableChildren = true;

  blueprint.blueprintItems.map(item => {
    item.updateTileables(blueprint);
    item.drawPixi(exportCamera, pixi);
  });

  const baseRenderTexture = pixi.getNewBaseRenderTexture({ width: size, height: size });
  const renderTexture = pixi.getNewRenderTexture(baseRenderTexture);
  pixi.pixiApp.renderer.render(exportCamera.container, renderTexture, false);
  const base64: string = pixi.pixiApp.renderer.plugins.extract
    .canvas(renderTexture)
    .toDataURL()
    .replace(/^data:image\/png;base64,/, '');

  exportCamera.container.destroy({ children: true });
  baseRenderTexture.destroy();
  renderTexture.destroy();
  global.gc && global.gc();

  return base64;
}

// Minimal blueprint exercising every texture path: a flat-icon building
// (Battery), a tileable atlas-backed tile, a connectable (Wire, 16 bitmask
// sprites) and a building with utility ports (LiquidPump). Rendered by
// `--smoke` to validate the deployed image end-to-end.
const SMOKE_FIXTURE: MdbBlueprint = {
  blueprintItems: [
    { id: 'Battery', position: new Vector2(0, 0) },
    { id: 'Tile', position: new Vector2(2, 0) },
    { id: 'Tile', position: new Vector2(3, 0) },
    { id: 'Wire', position: new Vector2(2, 1), connections: 3 },
    { id: 'Wire', position: new Vector2(3, 1), connections: 1 },
    { id: 'LiquidPump', position: new Vector2(0, 3) },
  ],
};

// Render the fixture and exit 0/1. Run inside the built prod image (ideally
// under a prod-like memory cap) to validate what unit tests cannot: the
// canvas native binding, the on-disk asset layout, and the memory envelope.
async function runSmokeTest(pixi: PixiNodeUtil, assetBaseDir: string) {
  const blueprint = new SharedBlueprint();
  blueprint.importFromMdb(SMOKE_FIXTURE);
  const missing = await ensureTextures(pixi, assetBaseDir, collectImageIds(blueprint));
  if (missing > 0) throw new Error(`smoke: ${missing} fixture textures missing from asset root`);

  const pngBase64 = await renderMaster(pixi, assetBaseDir, SMOKE_FIXTURE, 1200);
  const pngBytes = Buffer.from(pngBase64, 'base64').length;
  // A 1200px render of the fixture is far larger than this; placeholder-only
  // output (near-empty PNG) is the failure this guards against.
  if (pngBytes < 10_000) throw new Error(`smoke: render suspiciously small (${pngBytes} bytes)`);
  logRss(`smoke render ok (${pngBytes} png bytes)`);
}

async function main() {
  const smoke = process.argv.includes('--smoke');
  if (!smoke && !process.send)
    throw new Error('preview-render-worker must be forked with an IPC channel');

  initSharedLib();
  const pixi = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });
  const assetBaseDir = resolveAssetBaseDir();

  // Safety net for image ids collectImageIds missed: PixiNodeUtil throws here
  // by design ("all textures should be preloaded"); in this worker a warning
  // plus a blank placeholder beats failing the whole render.
  pixi.getNewBaseTexture = (url: string) => {
    console.warn(`preview-render-worker: texture not preloaded, using placeholder: ${url}`);
    return pixi.getNewBaseRenderTexture({ width: 1, height: 1 });
  };

  if (smoke) {
    await runSmokeTest(pixi, assetBaseDir);
    process.exit(0);
  }

  // Loaded textures accumulate across renders (ImageSource caches per image
  // id), so a long-lived worker serving many distinct blueprints drifts back
  // toward the full-preload footprint. Once RSS crosses the cap, exit between
  // renders: the parent re-forks on the next request (~1s cold start) and the
  // container never approaches the cgroup memory limit.
  const maxRssMb = Number(process.env.PREVIEW_WORKER_MAX_RSS_MB ?? 384);
  let rendersInFlight = 0;

  process.on('message', async (message: any) => {
    if (!message || message.type !== 'render') return;
    const { requestId, mdb, size } = message;
    rendersInFlight++;
    try {
      const pngBase64 = await renderMaster(pixi, assetBaseDir, mdb, size);
      process.send!({ type: 'rendered', requestId, pngBase64 });
      logRss(`rendered request ${requestId}`);
    } catch (e) {
      process.send!({ type: 'error', requestId, message: e instanceof Error ? e.message : String(e) });
    } finally {
      rendersInFlight--;
    }
    const rssMb = process.memoryUsage().rss / (1024 * 1024);
    if (rendersInFlight === 0 && rssMb > maxRssMb) {
      console.log(
        `preview-render-worker: rss ${Math.round(rssMb)}MB over ${maxRssMb}MB cap, recycling`
      );
      process.exit(0);
    }
  });

  process.send!({ type: 'ready' });
  logRss('ready');
}

main().catch(e => {
  console.error('preview-render-worker failed to start:', e);
  process.exit(1);
});
