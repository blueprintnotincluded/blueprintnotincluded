import crypto from 'crypto';
import fs from 'fs';
import sharp from 'sharp';
import { Avatar, AvatarModel, AvatarSourceType } from '../models/avatar';
import { AvatarBatchModel } from '../models/avatar-batch';
import { AvatarSeedUpload, AvatarSeedUploadModel } from '../models/avatar-seed-upload';
import { UserModel } from '../models/user';
import {
  AvatarImageProvider,
  GeminiAvatarProvider,
  ReferenceImage,
} from './gemini-avatar-provider';
import {
  AVATAR_TEMPLATE_FACE_GRID,
  AVATAR_TEMPLATE_GRID,
  faceGridAvatarPrompt,
  gridAvatarPrompt,
} from './avatar-prompts';

// Avatar pipeline + pool management (spec/social/avatars-identity.md).
//
// Grid mode: every provider call asks for one 512px image holding a 2x2 grid
// of four avatars, sliced server-side into four 256px assets — four avatars
// for the price of one 512px generation (~$0.011 each). The full grid is kept
// verbatim on an AvatarBatch row; tiles reference it via batchId.
//
// The committed duplicant style sheet is attached to every generation so
// output matches the ONI portrait style specifically, not generic cartoon.
//
// Pool: avatars with { status: 'ready', assignedTo: null } are claimable.
// Claiming is an atomic findOneAndUpdate on { _id, assignedTo: null }, so two
// concurrent assigns can never hand out the same avatar; the loser of a race
// just retries with another candidate. Refill runs in-process (this deploy is
// a single instance, same trade-off as BlueprintCounterService); move it to a
// real job runner if the API is ever replicated.

export const DISPLAY_SIZE = 256;
export const GRID_TILES = 4;

const STYLE_SHEET_PATH = 'assets/avatar-reference/duplicant-style-sheet.jpg';

export interface GenerateOptions {
  sourceType: AvatarSourceType;
  seedUpload?: AvatarSeedUpload | null;
  reference?: ReferenceImage | null;
}

export class AvatarService {
  private static _instance: AvatarService | null = null;
  public static get instance(): AvatarService {
    if (this._instance == null) this._instance = new AvatarService();
    return this._instance;
  }
  // Tests swap in an instance built around a fake provider
  public static setInstanceForTest(instance: AvatarService | null) {
    this._instance = instance;
  }

  public readonly provider: AvatarImageProvider;
  private refillInFlight = false;
  private styleSheet: ReferenceImage | null | undefined; // undefined = not loaded yet

  constructor(provider: AvatarImageProvider = new GeminiAvatarProvider()) {
    this.provider = provider;
  }

  private get lowWaterMark(): number {
    return parseInt(process.env.AVATAR_POOL_LOW_WATER || '5', 10);
  }
  private get refillBatchSize(): number {
    return parseInt(process.env.AVATAR_POOL_REFILL || '5', 10);
  }

  public isEnabled(): boolean {
    return this.provider.isConfigured();
  }

  // The committed style sheet, downscaled at build time (~1024px jpeg ≈ 1k
  // input tokens ≈ $0.0005/call). Missing file degrades to sheet-less
  // prompting rather than failing generation.
  public getStyleSheet(): ReferenceImage | null {
    if (this.styleSheet !== undefined) return this.styleSheet;
    try {
      const path = process.env.AVATAR_STYLE_REFERENCE || STYLE_SHEET_PATH;
      this.styleSheet = { data: fs.readFileSync(path), mimeType: 'image/jpeg' };
    } catch {
      console.log(`[avatar] style sheet not found at ${STYLE_SHEET_PATH} — generating without it`);
      this.styleSheet = null;
    }
    return this.styleSheet;
  }

  // ─── Generation ────────────────────────────────────────────────────────────

  // One provider call in grid mode → one AvatarBatch + up to four Avatar rows
  // (fewer when a tile dedupes against an existing avatar, in which case the
  // existing avatar is returned in its place).
  public async generateBatch(options: GenerateOptions): Promise<Avatar[]> {
    const { sourceType } = options;
    const { prompt, promptTemplate } = this.buildPrompt(options);

    const log = (msg: string) => console.log(`[avatar] ${msg}`);
    log(`generate start source=${sourceType} template=${promptTemplate}`);

    const references: ReferenceImage[] = [];
    const sheet = this.getStyleSheet();
    if (sheet) references.push(sheet);
    if (options.reference) references.push(options.reference);

    try {
      const result = await this.provider.generateImage(prompt, references);
      log(
        `provider ok model=${result.model} latencyMs=${result.latencyMs} bytes=${result.buffer.length}`
      );

      const gridSha256 = crypto.createHash('sha256').update(result.buffer).digest('hex');
      const existingBatch = await AvatarBatchModel.model.findOne({ sha256: gridSha256 });
      if (existingBatch) {
        log(`grid dedupe hit → existing batch ${existingBatch.id}`);
        return AvatarModel.model.find({ batchId: existingBatch._id, status: 'ready' });
      }

      const gridMeta = await sharp(result.buffer).metadata();
      const batch = await AvatarBatchModel.model.create({
        provider: 'gemini',
        providerModel: result.model,
        promptTemplate,
        prompt,
        sourceType,
        seedUploadId: options.seedUpload?._id ?? null,
        bytes: result.buffer,
        contentType: result.mimeType,
        width: gridMeta.width,
        height: gridMeta.height,
        sha256: gridSha256,
        interactionId: result.interactionId ?? null,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });

      // Slice quadrants from the actual dimensions (the model may not return
      // exactly 512) and normalize every tile to the display size
      const halfW = Math.floor((gridMeta.width ?? DISPLAY_SIZE * 2) / 2);
      const halfH = Math.floor((gridMeta.height ?? DISPLAY_SIZE * 2) / 2);
      // The model tends to draw thin frames around grid cells despite the
      // prompt; a ~4% inset crops them and is invisible when absent
      const insetW = Math.round(halfW * 0.04);
      const insetH = Math.round(halfH * 0.04);

      const avatars: Avatar[] = [];
      for (let i = 0; i < GRID_TILES; i++) {
        const tileBytes = await sharp(result.buffer)
          .extract({
            left: (i % 2) * halfW + insetW,
            top: Math.floor(i / 2) * halfH + insetH,
            width: halfW - 2 * insetW,
            height: halfH - 2 * insetH,
          })
          .resize(DISPLAY_SIZE, DISPLAY_SIZE, { fit: 'cover' })
          .png()
          .toBuffer();
        const tileSha256 = crypto.createHash('sha256').update(tileBytes).digest('hex');

        const existing = await AvatarModel.model.findOne({ sha256: tileSha256 });
        if (existing) {
          log(`tile ${i} dedupe hit → existing avatar ${existing.id}`);
          avatars.push(existing);
          continue;
        }

        const avatar = await AvatarModel.model.create({
          provider: 'gemini',
          providerModel: result.model,
          promptTemplate,
          prompt,
          sourceType,
          seedUploadId: options.seedUpload?._id ?? null,
          batchId: batch._id,
          gridIndex: i,
          status: 'ready',
          bytes: tileBytes,
          contentType: 'image/png',
          width: DISPLAY_SIZE,
          height: DISPLAY_SIZE,
          originalBytes: tileBytes,
          originalContentType: 'image/png',
          originalWidth: DISPLAY_SIZE,
          originalHeight: DISPLAY_SIZE,
          sha256: tileSha256,
          interactionId: result.interactionId ?? null,
          latencyMs: result.latencyMs,
        });
        avatars.push(avatar);
      }
      log(`stored batch ${batch.id} → ${avatars.length} avatars`);
      return avatars;
    } catch (err) {
      // Failed attempts are recorded too — they cost money on the provider
      // side and the row is where latency/usage forensics start.
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[avatar] generate FAILED source=${sourceType}: ${message}`);
      await AvatarModel.model
        .create({
          provider: 'gemini',
          providerModel: process.env.AVATAR_IMAGE_MODEL || 'gemini-3.1-flash-image',
          promptTemplate,
          prompt,
          sourceType,
          seedUploadId: options.seedUpload?._id ?? null,
          status: 'failed',
          error: message.slice(0, 2000),
        })
        .catch(storeErr => console.log('[avatar] failed to record failed generation', storeErr));
      throw err;
    }
  }

  private buildPrompt(options: GenerateOptions): { prompt: string; promptTemplate: string } {
    if (options.sourceType === 'user-upload') {
      return { prompt: faceGridAvatarPrompt(), promptTemplate: AVATAR_TEMPLATE_FACE_GRID };
    }
    return { prompt: gridAvatarPrompt(), promptTemplate: AVATAR_TEMPLATE_GRID };
  }

  // Full user flow: optional uploaded photo → face check → seeded or random
  // grid → four candidates. The first is auto-assigned (the user immediately
  // has an avatar); the rest go to the pool and can be claimed via the select
  // endpoint. A previously assigned avatar returns to the pool.
  public async generateForUser(
    userId: string,
    upload?: { bytes: Buffer; contentType: string } | null
  ): Promise<{
    assigned: Avatar | null;
    candidates: Avatar[];
    faceLikely: boolean | null;
    seedUploadId: string | null;
  }> {
    let seedUpload: AvatarSeedUpload | null = null;
    let faceLikely: boolean | null = null;

    if (upload) {
      seedUpload = await this.storeSeedUpload(userId, upload.bytes, upload.contentType);
      faceLikely = seedUpload.faceLikely ?? null;
    }

    const candidates =
      seedUpload && faceLikely
        ? await this.generateBatch({
            sourceType: 'user-upload',
            seedUpload,
            reference: { data: seedUpload.bytes, mimeType: seedUpload.contentType },
          })
        : await this.generateBatch({ sourceType: 'random', seedUpload });

    let assigned: Avatar | null = null;
    for (const candidate of candidates) {
      if (await this.assignSpecificAvatar(userId, candidate)) {
        assigned = candidate;
        break;
      }
      // Deduped onto an avatar assigned to someone else — try the next tile
    }
    return { assigned, candidates, faceLikely, seedUploadId: seedUpload ? String(seedUpload.id) : null };
  }

  private async storeSeedUpload(
    userId: string,
    bytes: Buffer,
    contentType: string
  ): Promise<AvatarSeedUpload> {
    // Re-encode through sharp: validates the payload is a real image and strips
    // anything weird before it is stored or forwarded to the provider.
    const normalized = await sharp(bytes)
      .rotate() // apply EXIF orientation
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    const seedUpload = await AvatarSeedUploadModel.model.create({
      userId,
      bytes: normalized.data,
      contentType: 'image/jpeg',
      sha256: crypto.createHash('sha256').update(normalized.data).digest('hex'),
      width: normalized.info.width,
      height: normalized.info.height,
    });
    console.log(`[avatar] seed upload ${seedUpload.id} stored (${contentType} → jpeg)`);

    try {
      const classification = await this.provider.classifyFace({
        data: normalized.data,
        mimeType: 'image/jpeg',
      });
      seedUpload.faceLikely = classification.faceLikely;
      seedUpload.classifierModel = classification.model;
      seedUpload.classifierOutput = classification.rawOutput.slice(0, 500);
      await seedUpload.save();
      console.log(`[avatar] classify seed=${seedUpload.id} faceLikely=${classification.faceLikely}`);
    } catch (err) {
      // Classification failure falls back to random generation, not an error
      console.log('[avatar] face classification failed, falling back to random', err);
      seedUpload.faceLikely = false;
      await seedUpload.save();
    }
    return seedUpload;
  }

  // ─── Pool management ───────────────────────────────────────────────────────

  public async poolCount(): Promise<number> {
    return AvatarModel.model.countDocuments({ status: 'ready', assignedTo: null });
  }

  // Atomically claim a random unused avatar for the user. Returns null when
  // the pool is empty. Any previously assigned avatar is released back to the
  // pool — assets are reusable, never discarded.
  public async assignRandomFromPool(userId: string): Promise<Avatar | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = await AvatarModel.model.aggregate([
        { $match: { status: 'ready', assignedTo: null } },
        { $sample: { size: 1 } },
        { $project: { _id: 1 } },
      ]);
      if (candidates.length === 0) return null;

      const claimed = await AvatarModel.model.findOneAndUpdate(
        { _id: candidates[0]._id, assignedTo: null },
        { $set: { assignedTo: userId, assignedAt: new Date() } },
        { new: true }
      );
      if (claimed) {
        await this.pointUserAt(userId, claimed);
        this.maybeRefill();
        return claimed;
      }
      // Lost the race for this candidate — sample again
    }
    console.log('[avatar] assignRandomFromPool exhausted retries (pool contention)');
    return null;
  }

  // Atomic like the pool claim: an avatar assigned to someone else must not
  // be stolen (candidates from a dedupe hit can be anyone's).
  public async assignSpecificAvatar(userId: string, avatar: Avatar): Promise<boolean> {
    const claimed = await AvatarModel.model.findOneAndUpdate(
      { _id: avatar._id, status: 'ready', $or: [{ assignedTo: null }, { assignedTo: userId }] },
      { $set: { assignedTo: userId, assignedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      console.log(`[avatar] assignSpecificAvatar skipped: ${avatar.id} is assigned to another user`);
      return false;
    }
    await this.pointUserAt(userId, claimed);
    return true;
  }

  private async pointUserAt(userId: string, avatar: Avatar): Promise<void> {
    const previous = await UserModel.model.findByIdAndUpdate(userId, { avatarId: avatar._id });
    const previousAvatarId = previous?.avatarId;
    if (previousAvatarId && String(previousAvatarId) !== String(avatar._id)) {
      await this.release(String(previousAvatarId));
    }
  }

  // Back to the pool: the asset stays and becomes claimable again
  public async release(avatarId: string): Promise<void> {
    await AvatarModel.model.updateOne(
      { _id: avatarId },
      { $set: { assignedTo: null, assignedAt: null } }
    );
    console.log(`[avatar] released ${avatarId} back to pool`);
  }

  public async releaseCurrentAvatar(userId: string): Promise<boolean> {
    const user = await UserModel.model.findByIdAndUpdate(userId, { avatarId: null });
    if (!user?.avatarId) return false;
    await this.release(String(user.avatarId));
    return true;
  }

  // Best-effort signup hook: assign from the pool if possible, never block or
  // fail registration over avatars.
  public tryAssignOnSignup(userId: string): void {
    this.assignRandomFromPool(userId)
      .then(avatar => {
        if (avatar) console.log(`[avatar] signup assignment user=${userId} avatar=${avatar.id}`);
        else console.log(`[avatar] signup assignment skipped (empty pool) user=${userId}`);
      })
      .catch(err => console.log('[avatar] signup assignment failed', err));
  }

  // Fire-and-forget refill when the unused pool drops below the low-water
  // mark. Serialized by the in-flight flag; failures just wait for the next
  // trigger (an assignment) instead of retry-looping against a broken provider.
  public maybeRefill(): void {
    if (this.refillInFlight || !this.isEnabled()) return;
    this.refillInFlight = true;
    (async () => {
      try {
        const count = await this.poolCount();
        if (count >= this.lowWaterMark) return;
        const calls = Math.ceil(this.refillBatchSize / GRID_TILES);
        console.log(
          `[avatar] pool low (${count} < ${this.lowWaterMark}), generating ${calls} grid(s)`
        );
        for (let i = 0; i < calls; i++) {
          await this.generateBatch({ sourceType: 'seed-batch' }).catch(() => {
            // already logged and recorded by generateBatch()
          });
        }
        console.log(`[avatar] refill done, pool now ${await this.poolCount()}`);
      } finally {
        this.refillInFlight = false;
      }
    })().catch(err => {
      this.refillInFlight = false;
      console.log('[avatar] refill failed', err);
    });
  }
}
