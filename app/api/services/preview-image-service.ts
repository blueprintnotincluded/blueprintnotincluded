// Server-authoritative blueprint preview images (spec/social/preview-images.md,
// Direction A). Renders a master PNG in a child worker process (see
// preview-render-worker.ts) and derives the served variants with sharp:
//
//   card.webp  480x480   browse/profile cards
//   hero.webp  1200x1200 details page hero
//   og.png     1200x630  Open Graph unfurl (letterboxed on white)
//
// Storage is two-tier (spec/social/preview-images-perf-2.md Phase 3):
//   L1 = local disk, keyed by blueprint id; fresh while the file is newer
//        than the blueprint's modifiedAt. Ephemeral — redeploys discard it.
//   L2 = Mongo (previewimages collection); fresh while the row's
//        sourceModifiedAt >= the blueprint's modifiedAt. Survives redeploys.
// Reads go disk → Mongo (hydrating disk) → render; renders write both, so
// restores, forks and any future server-side edit invalidate naturally.
import { fork, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { PreviewImageModel } from '../models/preview-image';

export type PreviewVariant = 'card.webp' | 'hero.webp' | 'og.png';

export const PREVIEW_VARIANTS: PreviewVariant[] = ['card.webp', 'hero.webp', 'og.png'];

const MASTER_SIZE = 1200;
const CARD_SIZE = 480;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_MARGIN = 30;

const RENDER_TIMEOUT_MS = 30_000;
const WORKER_START_TIMEOUT_MS = 60_000;

export interface PreviewRenderResult {
  buffer: Buffer;
  contentType: string;
}

/** Raw RGBA pixels as produced by the render worker (sharp raw input). */
export interface RawMaster {
  raw: Buffer;
  width: number;
  height: number;
}

/** A master render: raw pixels from the worker, or an encoded image (tests). */
export type MasterImage = Buffer | RawMaster;

type RenderMasterFn = (mdb: unknown) => Promise<MasterImage>;

interface PendingRequest {
  resolve: (master: RawMaster) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class PreviewImageService {
  private static instance_: PreviewImageService | null = null;
  public static get instance(): PreviewImageService {
    if (this.instance_ == null) this.instance_ = new PreviewImageService();
    return this.instance_;
  }
  /** Test hook: replace the singleton (e.g. with an injected renderMasterFn). */
  public static setInstance(instance: PreviewImageService | null) {
    this.instance_ = instance;
  }

  private worker: ChildProcess | null = null;
  private workerReady: Promise<void> | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private idleTimer: NodeJS.Timeout | null = null;
  private inFlight = new Map<string, Promise<void>>();
  private renderQueueTail: Promise<unknown> = Promise.resolve();
  private renderQueueDepth = 0;

  private readonly cacheDir: string;
  private readonly idleShutdownMs: number;
  private readonly renderMasterFn: RenderMasterFn;
  private readonly renderQueueMax: number;
  private readonly disabled: boolean;

  constructor(options?: {
    cacheDir?: string;
    renderMasterFn?: RenderMasterFn;
    idleShutdownMs?: number;
    renderQueueMax?: number;
    disabled?: boolean;
  }) {
    this.cacheDir =
      options?.cacheDir ??
      process.env.PREVIEW_CACHE_DIR ??
      path.resolve(__dirname, '../../../preview-cache');
    // 0 disables idle shutdown (the default): the server idles most of the
    // time and a resident warm worker (~200-380MB) is what keeps renders off
    // the cold-start path. The RSS recycle remains the memory backstop.
    this.idleShutdownMs =
      options?.idleShutdownMs ?? Number(process.env.PREVIEW_WORKER_IDLE_MS ?? 0);
    this.renderMasterFn = options?.renderMasterFn ?? (mdb => this.renderMasterInWorker(mdb));
    const queueMaxRaw =
      options?.renderQueueMax ?? Number(process.env.PREVIEW_RENDER_QUEUE_MAX ?? 8);
    this.renderQueueMax = Number.isFinite(queueMaxRaw) && queueMaxRaw > 0 ? queueMaxRaw : 8;
    // Default off in tests (no canvas/PIXI in CI) and behind an env kill switch.
    this.disabled =
      options?.disabled ??
      (process.env.PREVIEW_RENDER_DISABLED === '1' || process.env.NODE_ENV === 'test');
  }

  private variantPath(blueprintId: string, variant: PreviewVariant): string {
    return path.join(this.cacheDir, blueprintId, variant);
  }

  private static contentType(variant: PreviewVariant): string {
    return variant.endsWith('.png') ? 'image/png' : 'image/webp';
  }

  /**
   * Serve a variant for the blueprint, rendering and caching all variants on
   * a miss. `modifiedAt` drives freshness. Returns null when rendering is
   * disabled or fails (callers fall back to the legacy stored thumbnail).
   */
  public async getVariant(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    variant: PreviewVariant,
    loadMdb: () => Promise<unknown | null>
  ): Promise<PreviewRenderResult | null> {
    const filePath = this.variantPath(blueprintId, variant);

    const cached = this.readIfFresh(filePath, modifiedAt);
    if (cached) return { buffer: cached, contentType: PreviewImageService.contentType(variant) };

    // L2: a durable row survives redeploys; hydrate the disk cache so the
    // next request for this variant is an L1 hit. Serving from Mongo is not
    // rendering, so this path stays live even when rendering is disabled.
    const stored = await this.readFromMongo(blueprintId, variant, modifiedAt);
    if (stored) {
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, stored.buffer);
      } catch {
        // Hydration is an optimization; serving the bytes is what matters.
      }
      return stored;
    }

    if (this.disabled) return null;

    try {
      await this.renderSingleFlight(blueprintId, modifiedAt, loadMdb);
    } catch (e) {
      // console.log: the test harness fails any test touching console.error
      console.log(`Preview render failed for ${blueprintId}:`, e);
      return null;
    }

    try {
      const buffer = await fs.promises.readFile(filePath);
      return { buffer, contentType: PreviewImageService.contentType(variant) };
    } catch {
      return null;
    }
  }

  private readIfFresh(filePath: string, modifiedAt: Date | null | undefined): Buffer | null {
    if (!this.isFresh(filePath, modifiedAt)) return null;
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  private isFresh(filePath: string, modifiedAt: Date | null | undefined): boolean {
    try {
      const stat = fs.statSync(filePath);
      return modifiedAt == null || stat.mtimeMs > modifiedAt.getTime();
    } catch {
      return false;
    }
  }

  // --- Mongo (L2) storage ---

  /** The Mongo twin of the disk mtime rule. */
  public static isRowFresh(
    sourceModifiedAt: Date | null | undefined,
    modifiedAt: Date | null | undefined
  ): boolean {
    if (modifiedAt == null) return true;
    return sourceModifiedAt != null && sourceModifiedAt.getTime() >= modifiedAt.getTime();
  }

  private static mongoAvailable(): boolean {
    return PreviewImageModel.model != null && mongoose.connection.readyState === 1;
  }

  private async readFromMongo(
    blueprintId: string,
    variant: PreviewVariant,
    modifiedAt: Date | null | undefined
  ): Promise<PreviewRenderResult | null> {
    if (!PreviewImageService.mongoAvailable()) return null;
    try {
      const row = await PreviewImageModel.model.findOne({ blueprintId, variant }).lean();
      if (!row || !PreviewImageService.isRowFresh(row.sourceModifiedAt, modifiedAt)) return null;
      // lean() may surface the bytes as a driver Binary instead of a Buffer.
      const bytes: any = row.bytes;
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer);
      return { buffer, contentType: row.contentType };
    } catch (e) {
      console.log(`preview Mongo read failed for ${blueprintId}/${variant}:`, e);
      return null;
    }
  }

  /**
   * True when every variant has a fresh durable row. Errors (and an
   * unavailable Mongo) read as stale — callers just render. Public for the
   * backfill script, which uses it to skip already-stored blueprints.
   */
  public async allFreshInMongo(
    blueprintId: string,
    modifiedAt: Date | null | undefined
  ): Promise<boolean> {
    if (!PreviewImageService.mongoAvailable()) return false;
    try {
      const rows = await PreviewImageModel.model
        .find({ blueprintId })
        .select('variant sourceModifiedAt')
        .lean();
      const byVariant = new Map(rows.map(row => [row.variant, row.sourceModifiedAt]));
      return PREVIEW_VARIANTS.every(
        variant =>
          byVariant.has(variant) &&
          PreviewImageService.isRowFresh(byVariant.get(variant), modifiedAt)
      );
    } catch {
      return false;
    }
  }

  private async writeToMongo(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    buffers: { variant: PreviewVariant; buffer: Buffer }[]
  ): Promise<void> {
    if (!PreviewImageService.mongoAvailable()) return;
    try {
      const renderedAt = new Date();
      await PreviewImageModel.model.bulkWrite(
        buffers.map(({ variant, buffer }) => ({
          updateOne: {
            filter: { blueprintId, variant },
            update: {
              $set: {
                bytes: buffer,
                contentType: PreviewImageService.contentType(variant),
                renderedAt,
                sourceModifiedAt: modifiedAt ?? null,
              },
            },
            upsert: true,
          },
        }))
      );
    } catch (e) {
      // Durability is best-effort per render: the disk copy still serves,
      // and the backfill script / next render retries the Mongo write.
      console.log(`preview Mongo write failed for ${blueprintId}:`, e);
    }
  }

  /**
   * Render-on-write (spec/social/preview-images-perf-2.md Phase 2):
   * fire-and-forget render of every variant so the first browse view after a
   * save/fork/restore serves from cache. Skips when the cache is already
   * fresh; shares the single-flight map and queue cap with getVariant, so a
   * shed or failed render just means the lazy read path picks it up later —
   * never a user-visible failure.
   */
  public prerender(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    loadMdb: () => Promise<unknown | null>
  ): void {
    if (this.disabled) return;
    const allFresh = PREVIEW_VARIANTS.every(variant =>
      this.isFresh(this.variantPath(blueprintId, variant), modifiedAt)
    );
    if (allFresh) return;

    (async () => {
      // Fresh durable rows mean the read path serves (and hydrates disk)
      // without rendering — nothing to do.
      if (await this.allFreshInMongo(blueprintId, modifiedAt)) return;
      await this.renderSingleFlight(blueprintId, modifiedAt, loadMdb);
    })().catch(e => console.log(`preview prerender failed for ${blueprintId}:`, e));
  }

  /**
   * Render every variant and write them to disk + Mongo, deduplicating
   * concurrent requests per blueprint (one master render produces every
   * variant). Used by the read path, prerender and the backfill script.
   */
  public renderAndStore(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    loadMdb: () => Promise<unknown | null>
  ): Promise<void> {
    return this.renderSingleFlight(blueprintId, modifiedAt, loadMdb);
  }

  private renderSingleFlight(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    loadMdb: () => Promise<unknown | null>
  ): Promise<void> {
    let render = this.inFlight.get(blueprintId);
    if (!render) {
      render = this.renderAllVariants(blueprintId, modifiedAt, loadMdb).finally(() =>
        this.inFlight.delete(blueprintId)
      );
      this.inFlight.set(blueprintId, render);
    }
    return render;
  }

  /**
   * Serialize master renders: the worker rasterizes one blueprint at a time,
   * so dispatching concurrently only made every caller share one wall-clock
   * timeout budget — a page of card requests would queue on the worker and
   * then all time out together. The render timeout now covers only the
   * active render. Depth is capped so a pile-up fails fast (callers serve the
   * legacy thumbnail) instead of holding requests for minutes.
   */
  private enqueueMasterRender(
    mdb: unknown
  ): Promise<{ master: MasterImage; queueWaitMs: number; masterMs: number; cold: boolean }> {
    if (this.renderQueueDepth >= this.renderQueueMax) {
      return Promise.reject(
        new Error(`preview render queue full (${this.renderQueueDepth} waiting)`)
      );
    }
    this.renderQueueDepth++;
    const enqueuedAt = Date.now();
    const render = this.renderQueueTail.then(async () => {
      const startedAt = Date.now();
      const cold = this.worker == null;
      const master = await this.renderMasterFn(mdb);
      return {
        master,
        queueWaitMs: startedAt - enqueuedAt,
        masterMs: Date.now() - startedAt,
        cold,
      };
    });
    this.renderQueueTail = render.catch(() => undefined);
    return render.finally(() => this.renderQueueDepth--);
  }

  private async renderAllVariants(
    blueprintId: string,
    modifiedAt: Date | null | undefined,
    loadMdb: () => Promise<unknown | null>
  ) {
    const totalStart = Date.now();
    const mdb = await loadMdb();
    if (mdb == null) throw new Error('blueprint has no data');
    const loadMdbMs = Date.now() - totalStart;

    const {
      master: masterImage,
      queueWaitMs,
      masterMs,
      cold,
    } = await this.enqueueMasterRender(mdb);
    const derivativesStart = Date.now();

    const dir = path.join(this.cacheDir, blueprintId);
    await fs.promises.mkdir(dir, { recursive: true });

    const master = Buffer.isBuffer(masterImage)
      ? sharp(masterImage)
      : sharp(masterImage.raw, {
          raw: { width: masterImage.width, height: masterImage.height, channels: 4 },
        });
    const card = master
      .clone()
      .resize(CARD_SIZE, CARD_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82 })
      .toBuffer();
    const hero = master.clone().webp({ quality: 82 }).toBuffer();
    // OG: trim the transparent framing margins, letterbox onto white at the
    // real unfurl aspect ratio.
    const og = master
      .clone()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) =>
        sharp(data, {
          raw: { width: info.width, height: info.height, channels: info.channels as 4 },
        })
          .resize(OG_WIDTH - OG_MARGIN * 2, OG_HEIGHT - OG_MARGIN * 2, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .extend({
            top: OG_MARGIN,
            bottom: OG_MARGIN,
            left: OG_MARGIN,
            right: OG_MARGIN,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png()
          .toBuffer()
      );

    const [cardBuf, heroBuf, ogBuf] = await Promise.all([card, hero, og]);
    const variantBuffers: { variant: PreviewVariant; buffer: Buffer }[] = [
      { variant: 'card.webp', buffer: cardBuf },
      { variant: 'hero.webp', buffer: heroBuf },
      { variant: 'og.png', buffer: ogBuf },
    ];
    await Promise.all(
      variantBuffers.map(({ variant, buffer }) =>
        fs.promises.writeFile(path.join(dir, variant), buffer)
      )
    );
    const mongoStart = Date.now();
    await this.writeToMongo(blueprintId, modifiedAt, variantBuffers);

    // Phase timings (spec/social/preview-images-perf.md Phase 0). The worker
    // logs its own sub-phases (import/textures/rasterize/encode) per request.
    console.log(
      `preview render ${blueprintId}: loadMdb=${loadMdbMs}ms queueWait=${queueWaitMs}ms` +
        ` master=${masterMs}ms${cold ? ' (cold)' : ''}` +
        ` derivatives=${mongoStart - derivativesStart}ms` +
        ` mongo=${Date.now() - mongoStart}ms total=${Date.now() - totalStart}ms` +
        ` parentRss=${Math.round(process.memoryUsage().rss / (1024 * 1024))}MB`
    );
  }

  // --- worker process management ---

  private renderMasterInWorker(mdb: unknown): Promise<RawMaster> {
    return this.ensureWorker().then(
      () =>
        new Promise<RawMaster>((resolve, reject) => {
          const requestId = this.nextRequestId++;
          const timer = setTimeout(() => {
            this.pending.delete(requestId);
            // Renders are serialized, so a timeout means the worker is wedged
            // on this render; recycle it so the next render forks fresh
            // instead of waiting behind the stuck one.
            this.stopWorker();
            reject(new Error('preview render timed out'));
          }, RENDER_TIMEOUT_MS);
          this.pending.set(requestId, { resolve, reject, timer });
          this.worker!.send({ type: 'render', requestId, mdb, size: MASTER_SIZE });
          this.scheduleIdleShutdown();
        })
    );
  }

  private ensureWorker(): Promise<void> {
    if (this.worker && this.workerReady) return this.workerReady;

    const workerModule = path.join(__dirname, 'preview-render-worker');
    const isTs = __filename.endsWith('.ts');
    const worker = fork(workerModule + (isTs ? '.ts' : '.js'), [], {
      execArgv: isTs ? ['-r', 'ts-node/register/transpile-only'] : [],
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      // Structured clone instead of JSON: the rendered master crosses the
      // channel as a Buffer, not a base64 string inside a JSON megastring.
      serialization: 'advanced',
    });
    this.worker = worker;

    this.workerReady = new Promise<void>((resolve, reject) => {
      const startTimer = setTimeout(() => {
        reject(new Error('preview render worker did not start in time'));
        this.stopWorker();
      }, WORKER_START_TIMEOUT_MS);

      worker.on('message', (message: any) => {
        if (message?.type === 'ready') {
          clearTimeout(startTimer);
          this.scheduleIdleShutdown();
          resolve();
          return;
        }
        if (message?.type === 'rendered' || message?.type === 'error') {
          const pendingRequest = this.pending.get(message.requestId);
          if (!pendingRequest) return;
          this.pending.delete(message.requestId);
          clearTimeout(pendingRequest.timer);
          if (message.type === 'rendered') {
            pendingRequest.resolve({
              raw: Buffer.isBuffer(message.raw) ? message.raw : Buffer.from(message.raw),
              width: message.width,
              height: message.height,
            });
          } else pendingRequest.reject(new Error(message.message));
        }
      });

      worker.on('exit', (code, signal) => {
        clearTimeout(startTimer);
        // Stale exit: this worker was already stopped/replaced (kill() fires
        // 'exit' asynchronously). Don't touch the current worker's state.
        if (this.worker !== worker) return;
        // code/signal distinguish a crash (code>0), an OOM/external kill
        // (signal, e.g. SIGKILL from the cgroup) and our own idle shutdown.
        const reason = `preview render worker exited (code=${code}, signal=${signal})`;
        for (const [, pendingRequest] of this.pending) {
          clearTimeout(pendingRequest.timer);
          pendingRequest.reject(new Error(reason));
        }
        this.pending.clear();
        this.worker = null;
        this.workerReady = null;
        reject(new Error(reason));
        // A clean self-exit is the RSS recycle (the worker only does it
        // between renders). Re-fork right away so the next render stays warm.
        // Crashes (code>0) and signals stay lazy — no re-fork loop.
        if (code === 0 && signal == null) setImmediate(() => this.warmUp());
      });

      worker.on('error', err => {
        clearTimeout(startTimer);
        this.worker = null;
        this.workerReady = null;
        reject(err);
      });
    });

    return this.workerReady;
  }

  /**
   * Fork the render worker ahead of the first request (server boot, or after
   * an RSS recycle) so no request pays the ~10s cold start. No-op when
   * rendering is disabled or a worker is already up.
   */
  public warmUp() {
    if (this.disabled || this.worker) return;
    this.ensureWorker().catch(e => console.log('preview render worker warm-up failed:', e));
  }

  private scheduleIdleShutdown() {
    if (this.idleShutdownMs <= 0) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.stopWorker();
      else this.scheduleIdleShutdown();
    }, this.idleShutdownMs);
    this.idleTimer.unref();
  }

  public stopWorker() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
      this.workerReady = null;
    }
  }
}
