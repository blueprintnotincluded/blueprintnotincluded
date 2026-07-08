// Standalone child process that renders blueprint preview images with the
// node Canvas + PIXI stack. Runs out-of-process because pixi-shim installs
// DOM globals and the preloaded texture set costs ~400MB RSS — neither
// belongs in the API process. Spawned lazily by PreviewImageService and
// killed again after an idle period.
//
// IPC protocol (all messages JSON over process.send):
//   parent -> worker: { type: 'render', requestId, mdb, size }
//   worker -> parent: { type: 'ready' }
//                     { type: 'rendered', requestId, pngBase64 }
//                     { type: 'error', requestId, message }
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

// Preload every registered texture. Missing files get a 1x1 transparent
// placeholder instead of failing the whole worker: node PIXI cannot load
// textures lazily (sync getBaseTexture), and a handful of legacy ui sprites
// may be absent without affecting blueprint rendering.
async function initTextures(pixi: PixiNodeUtil, baseDir: string) {
  let missing = 0;
  for (const key of ImageSource.keys) {
    const imageUrl = ImageSource.getUrl(key)!;
    const filePath = path.join(baseDir, imageUrl);
    try {
      const baseTexture = await pixi.getImageFromCanvas(filePath);
      ImageSource.setBaseTexture(key, baseTexture);
    } catch {
      missing++;
      ImageSource.setBaseTexture(key, pixi.getNewBaseRenderTexture({ width: 1, height: 1 }));
    }
  }
  if (missing > 0) console.warn(`preview-render-worker: ${missing} textures missing, using placeholders`);
}

// Deterministic fit-to-content framing — same camera rules as the historic
// thumbnail path (~1.5 tiles padding, content centered on a square canvas)
// but without the integer zoom flooring so framing is resolution-independent.
function renderMaster(pixi: PixiNodeUtil, mdb: MdbBlueprint, size: number): string {
  const blueprint = new SharedBlueprint();
  blueprint.importFromMdb(mdb);
  if (blueprint.blueprintItems.length === 0) throw new Error('empty blueprint');

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

async function main() {
  if (!process.send) throw new Error('preview-render-worker must be forked with an IPC channel');

  initSharedLib();
  const pixi = new PixiNodeUtil({ forceCanvas: true, preserveDrawingBuffer: true });
  await initTextures(pixi, resolveAssetBaseDir());

  process.on('message', (message: any) => {
    if (!message || message.type !== 'render') return;
    const { requestId, mdb, size } = message;
    try {
      const pngBase64 = renderMaster(pixi, mdb, size);
      process.send!({ type: 'rendered', requestId, pngBase64 });
    } catch (e) {
      process.send!({ type: 'error', requestId, message: e instanceof Error ? e.message : String(e) });
    }
  });

  process.send({ type: 'ready' });
}

main().catch(e => {
  console.error('preview-render-worker failed to start:', e);
  process.exit(1);
});
