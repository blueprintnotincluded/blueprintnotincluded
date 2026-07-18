import crypto from 'crypto';
import sharp from 'sharp';
import { Avatar, AvatarModel, AvatarSourceType } from '../models/avatar';
import { AvatarSeedUpload, AvatarSeedUploadModel } from '../models/avatar-seed-upload';
import { UserModel } from '../models/user';
import {
  AvatarImageProvider,
  GeminiAvatarProvider,
  ReferenceImage,
} from './gemini-avatar-provider';
import {
  AVATAR_TEMPLATE_FACE,
  AVATAR_TEMPLATE_RANDOM,
  AVATAR_TEMPLATE_SEED_BATCH,
  faceAvatarPrompt,
  randomAvatarPrompt,
  seedBatchPrompt,
} from './avatar-prompts';

// Avatar pipeline + pool management (spec/social/avatars-identity.md).
//
// Pipeline shape is deterministic: normalize upload → classify face → pick
// prompt template → one provider call → store original + 256px derivative +
// metadata. Every provider call produces a row (failed ones included) — the
// images are paid assets and the rows are the cost/debug log.
//
// Pool: avatars with { status: 'ready', assignedTo: null } are claimable.
// Claiming is an atomic findOneAndUpdate on { _id, assignedTo: null }, so two
// concurrent assigns can never hand out the same avatar; the loser of a race
// just retries with another candidate. Refill runs in-process (this deploy is
// a single instance, same trade-off as BlueprintCounterService); move it to a
// real job runner if the API is ever replicated.

export const DISPLAY_SIZE = 256;

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

  // ─── Generation ────────────────────────────────────────────────────────────

  // One provider call → one Avatar row (ready or failed). Returns the ready
  // avatar, or the pre-existing one when the provider output deduped by hash.
  public async generate(options: GenerateOptions): Promise<Avatar> {
    const { sourceType } = options;
    const { prompt, promptTemplate } = this.buildPrompt(options);

    const log = (msg: string) => console.log(`[avatar] ${msg}`);
    log(`generate start source=${sourceType} template=${promptTemplate}`);

    try {
      const result = await this.provider.generateImage(prompt, options.reference ?? undefined);
      log(
        `provider ok model=${result.model} latencyMs=${result.latencyMs} bytes=${result.buffer.length}`
      );

      const sha256 = crypto.createHash('sha256').update(result.buffer).digest('hex');
      const existing = await AvatarModel.model.findOne({ sha256 });
      if (existing) {
        log(`dedupe hit sha256=${sha256.slice(0, 12)} → existing avatar ${existing.id}`);
        return existing;
      }

      const originalMeta = await sharp(result.buffer).metadata();
      const displayBytes = await sharp(result.buffer)
        .resize(DISPLAY_SIZE, DISPLAY_SIZE, { fit: 'cover' })
        .png()
        .toBuffer();

      const avatar = await AvatarModel.model.create({
        provider: 'gemini',
        providerModel: result.model,
        promptTemplate,
        prompt,
        sourceType,
        seedUploadId: options.seedUpload?._id ?? null,
        status: 'ready',
        bytes: displayBytes,
        contentType: 'image/png',
        width: DISPLAY_SIZE,
        height: DISPLAY_SIZE,
        originalBytes: result.buffer,
        originalContentType: result.mimeType,
        originalWidth: originalMeta.width,
        originalHeight: originalMeta.height,
        sha256,
        interactionId: result.interactionId ?? null,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });
      log(`stored avatar ${avatar.id} (${originalMeta.width}x${originalMeta.height} original)`);
      return avatar;
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
    switch (options.sourceType) {
      case 'user-upload':
        return { prompt: faceAvatarPrompt(), promptTemplate: AVATAR_TEMPLATE_FACE };
      case 'seed-batch':
        return options.reference
          ? { prompt: seedBatchPrompt(), promptTemplate: AVATAR_TEMPLATE_SEED_BATCH }
          : { prompt: randomAvatarPrompt(), promptTemplate: AVATAR_TEMPLATE_RANDOM };
      default:
        return { prompt: randomAvatarPrompt(), promptTemplate: AVATAR_TEMPLATE_RANDOM };
    }
  }

  // Full user flow: optional uploaded photo → face check → seeded or random
  // generation → assign the fresh avatar to the user (old one returns to pool).
  public async generateForUser(
    userId: string,
    upload?: { bytes: Buffer; contentType: string } | null
  ): Promise<{ avatar: Avatar; faceLikely: boolean | null; seedUploadId: string | null }> {
    let seedUpload: AvatarSeedUpload | null = null;
    let faceLikely: boolean | null = null;

    if (upload) {
      seedUpload = await this.storeSeedUpload(userId, upload.bytes, upload.contentType);
      faceLikely = seedUpload.faceLikely ?? null;
    }

    const avatar =
      seedUpload && faceLikely
        ? await this.generate({
            sourceType: 'user-upload',
            seedUpload,
            reference: { data: seedUpload.bytes, mimeType: seedUpload.contentType },
          })
        : await this.generate({ sourceType: 'random', seedUpload });

    const assigned = await this.assignSpecificAvatar(userId, avatar);
    if (!assigned) {
      // Deduped onto someone else's avatar — give this user a pool avatar instead
      await this.assignRandomFromPool(userId);
    }
    return { avatar, faceLikely, seedUploadId: seedUpload ? String(seedUpload.id) : null };
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

  // Atomic like the pool claim: a sha256-dedupe hit can hand back an avatar
  // that is already assigned to someone else, and that must not be stolen.
  public async assignSpecificAvatar(userId: string, avatar: Avatar): Promise<boolean> {
    const claimed = await AvatarModel.model.findOneAndUpdate(
      { _id: avatar._id, $or: [{ assignedTo: null }, { assignedTo: userId }] },
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
        const target = this.refillBatchSize;
        console.log(`[avatar] pool low (${count} < ${this.lowWaterMark}), generating ${target}`);
        for (let i = 0; i < target; i++) {
          await this.generate({ sourceType: 'random' }).catch(() => {
            // already logged and recorded by generate()
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
