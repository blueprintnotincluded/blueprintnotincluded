import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Avatar, AvatarModel } from './models/avatar';
import { AvatarBatchModel } from './models/avatar-batch';
import { UserModel, UserJwt } from './models/user';
import { AvatarService, GRID_TILES } from './services/avatar-service';
import { apiError } from './utils/apiError';

// Avatar endpoints:
//   GET    /api/users/:username/avatar   public image of a user's avatar (256px png)
//   GET    /api/avatars/:id/image        public image of any ready avatar (candidate previews)
//   POST   /api/users/me/avatar/generate one grid generation → 4 candidates, first auto-assigned
//   POST   /api/users/me/avatar/select   claim a specific unassigned candidate/pool avatar
//   POST   /api/users/me/avatar/assign   claim a random unused pool avatar
//   DELETE /api/users/me/avatar          release current avatar back to pool
//   POST   /api/admin/avatars/batch      admin batch generation
export class AvatarController {
  // Generation spends real money: one generation per user per day, enforced
  // against the durable AvatarBatch.requestedBy log (survives restarts,
  // unlike an in-process map). Selecting from the existing pool stays free
  // and unlimited.
  public static generateCooldownMs(): number {
    return parseInt(process.env.AVATAR_GENERATE_COOLDOWN_MS || String(24 * 60 * 60 * 1000), 10);
  }
  // Formats sharp can decode reliably; keep in sync with the profile page's
  // client-side check and the file input's accept attribute
  public static ALLOWED_SEED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  // Blocks a double-click racing two paid generations before the first batch
  // row lands
  private generateInFlight = new Set<string>();

  constructor() {
    this.getAvatar = this.getAvatar.bind(this);
    this.getAvatarImage = this.getAvatarImage.bind(this);
    this.getStatus = this.getStatus.bind(this);
    this.getAvailable = this.getAvailable.bind(this);
    this.generate = this.generate.bind(this);
    this.select = this.select.bind(this);
    this.assign = this.assign.bind(this);
    this.remove = this.remove.bind(this);
    this.adminBatch = this.adminBatch.bind(this);
  }

  // When the user's next generation unlocks; null = allowed now
  private async nextGenerateAt(userId: string): Promise<Date | null> {
    const lastBatch = await AvatarBatchModel.model
      .findOne({ requestedBy: userId })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();
    if (!lastBatch) return null;
    const unlockAt = new Date(
      (lastBatch.createdAt as Date).getTime() + AvatarController.generateCooldownMs()
    );
    return unlockAt.getTime() > Date.now() ? unlockAt : null;
  }

  private sendAvatarBytes(
    req: Request,
    res: Response,
    avatar: { bytes?: unknown; contentType?: string },
    etag: string,
    cacheControl: string
  ) {
    if (req.headers['if-none-match'] === etag) {
      res.set({ ETag: etag });
      return res.status(304).end();
    }
    res.set({
      'Content-Type': avatar.contentType ?? 'image/png',
      'Cache-Control': cacheControl,
      ETag: etag,
    });
    // lean() may surface the bytes as a driver Binary instead of a Buffer
    // (same handling as preview-image-service)
    const bytes: any = avatar.bytes;
    return res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer));
  }

  public async getAvatar(req: Request, res: Response) {
    try {
      const user = await UserModel.model
        .findOne({ username: req.params.username })
        .select('avatarId')
        .lean();
      if (!user?.avatarId) return res.status(404).send();

      const avatar = await AvatarModel.model
        .findOne({ _id: user.avatarId, status: 'ready' })
        .select('bytes contentType')
        .lean();
      if (!avatar?.bytes) return res.status(404).send();

      // Assignment changes swap the avatarId (new ETag), so a short shared
      // cache window is safe
      return this.sendAvatarBytes(
        req,
        res,
        avatar,
        `"avatar-${String(user.avatarId)}"`,
        'public, max-age=300'
      );
    } catch (err) {
      console.log('getAvatar error');
      console.log(err);
      return res.status(500).send();
    }
  }

  // Candidate previews for the generate/select flow. Avatar bytes never
  // change once stored, so the id-addressed URL is immutable.
  public async getAvatarImage(req: Request, res: Response) {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).send();
    try {
      const avatar = await AvatarModel.model
        .findOne({ _id: id, status: 'ready' })
        .select('bytes contentType')
        .lean();
      if (!avatar?.bytes) return res.status(404).send();
      return this.sendAvatarBytes(
        req,
        res,
        avatar,
        `"avatar-img-${id}"`,
        'public, max-age=31536000, immutable'
      );
    } catch (err) {
      console.log('getAvatarImage error');
      console.log(err);
      return res.status(500).send();
    }
  }

  private candidatePayload(avatar: Avatar) {
    return { id: String(avatar.id), url: `/api/avatars/${String(avatar.id)}/image` };
  }

  // Profile-page bootstrap: current avatar + when generation unlocks + how
  // big the free pool is
  public async getStatus(req: Request, res: Response) {
    const user = req.user as UserJwt;
    try {
      const [userDoc, unlockAt, poolCount] = await Promise.all([
        UserModel.model.findById(user._id).select('avatarId').lean(),
        this.nextGenerateAt(user._id),
        AvatarService.instance.poolCount(),
      ]);
      return res.json({
        avatarId: userDoc?.avatarId ? String(userDoc.avatarId) : null,
        nextGenerateAt: unlockAt ? unlockAt.toISOString() : null,
        poolCount,
      });
    } catch (err) {
      console.log('avatar getStatus error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Failed to load avatar status'));
    }
  }

  // Free-selection browser: a random sample of the unused pool
  public async getAvailable(_req: Request, res: Response) {
    try {
      const sample = await AvatarModel.model.aggregate([
        { $match: { status: 'ready', assignedTo: null } },
        { $sample: { size: 60 } },
        { $project: { _id: 1 } },
      ]);
      return res.json({
        avatars: sample.map(row => ({
          id: String(row._id),
          url: `/api/avatars/${String(row._id)}/image`,
        })),
        total: await AvatarService.instance.poolCount(),
      });
    } catch (err) {
      console.log('avatar getAvailable error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Failed to list available avatars'));
    }
  }

  public async generate(req: Request, res: Response) {
    const user = req.user as UserJwt;
    const service = AvatarService.instance;

    if (!service.isEnabled()) {
      return res.status(503).json(apiError(503, 'Avatar generation is not configured'));
    }

    if (this.generateInFlight.has(user._id)) {
      return res.status(429).json(apiError(429, 'A generation is already in progress'));
    }
    const unlockAt = await this.nextGenerateAt(user._id);
    if (unlockAt) {
      return res
        .status(429)
        .json({ ...apiError(429, 'You can generate one avatar per day'), retryAt: unlockAt.toISOString() });
    }

    // The route mounts express.raw({ type: 'image/*' }); any non-image body
    // arrives unparsed (req.body undefined or {}), which means "random"
    const body = req.body as unknown;
    const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    // An image/* body outside the allowlist would silently skip the raw
    // parser and come out as a random generation — reject it loudly instead
    if (contentType.startsWith('image/') && !AvatarController.ALLOWED_SEED_TYPES.includes(contentType)) {
      return res
        .status(415)
        .json(apiError(415, 'Unsupported image type — use a PNG, JPEG, or WebP photo'));
    }
    const upload =
      Buffer.isBuffer(body) && body.length > 0
        ? { bytes: body, contentType: contentType || 'image/jpeg' }
        : null;

    this.generateInFlight.add(user._id);
    try {
      const result = await service.generateForUser(user._id, upload);
      return res.json({
        avatarId: result.assigned ? String(result.assigned.id) : null,
        url: `/api/users/${user.username}/avatar`,
        candidates: result.candidates.map(c => this.candidatePayload(c)),
        sourceType: result.candidates[0]?.sourceType ?? null,
        faceLikely: result.faceLikely,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_SEED_IMAGE') {
        return res
          .status(400)
          .json(apiError(400, 'That file could not be read as an image — try another photo'));
      }
      console.log('avatar generate error');
      console.log(err);
      // A failed call writes no batch row, so the daily limit is not consumed
      // and the user can retry immediately
      return res.status(502).json(apiError(502, 'Avatar generation failed'));
    } finally {
      this.generateInFlight.delete(user._id);
    }
  }

  // Claim a specific avatar (typically one of the generate candidates). Any
  // ready+unassigned avatar is claimable — they are communal pool assets.
  public async select(req: Request, res: Response) {
    const user = req.user as UserJwt;
    const avatarId = (req.body as { avatarId?: unknown })?.avatarId;
    if (typeof avatarId !== 'string' || !mongoose.Types.ObjectId.isValid(avatarId)) {
      return res.status(400).json(apiError(400, 'Missing or invalid avatarId'));
    }
    try {
      const avatar = await AvatarModel.model.findOne({ _id: avatarId, status: 'ready' });
      if (!avatar) return res.status(404).json(apiError(404, 'Avatar not found'));

      const claimed = await AvatarService.instance.assignSpecificAvatar(user._id, avatar);
      if (!claimed) {
        return res.status(409).json(apiError(409, 'Avatar is already assigned to another user'));
      }
      return res.json({ avatarId, url: `/api/users/${user.username}/avatar` });
    } catch (err) {
      console.log('avatar select error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Failed to select avatar'));
    }
  }

  public async assign(req: Request, res: Response) {
    const user = req.user as UserJwt;
    try {
      const avatar = await AvatarService.instance.assignRandomFromPool(user._id);
      if (!avatar) {
        return res.status(404).json(apiError(404, 'No unused avatars available'));
      }
      return res.json({
        avatarId: String(avatar.id),
        url: `/api/users/${user.username}/avatar`,
      });
    } catch (err) {
      console.log('avatar assign error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Failed to assign avatar'));
    }
  }

  public async remove(req: Request, res: Response) {
    const user = req.user as UserJwt;
    try {
      const released = await AvatarService.instance.releaseCurrentAvatar(user._id);
      return res.json({ released });
    } catch (err) {
      console.log('avatar remove error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Failed to remove avatar'));
    }
  }

  public async adminBatch(req: Request, res: Response) {
    const service = AvatarService.instance;
    if (!service.isEnabled()) {
      return res.status(503).json(apiError(503, 'Avatar generation is not configured'));
    }

    // count is the number of avatars wanted; each provider call yields a grid
    // of GRID_TILES, so actual output is count rounded up to a full grid
    const count = Number((req.body as { count?: unknown })?.count);
    if (!Number.isInteger(count) || count < 1 || count > 40) {
      return res.status(400).json(apiError(400, 'count must be an integer between 1 and 40'));
    }

    try {
      const created: string[] = [];
      let failed = 0;
      const calls = Math.ceil(count / GRID_TILES);
      // Sequential on purpose: bounds provider concurrency and keeps cost
      // linear and observable in the logs
      for (let i = 0; i < calls; i++) {
        try {
          const avatars = await service.generateBatch({ sourceType: 'seed-batch' });
          created.push(...avatars.map(a => String(a.id)));
        } catch {
          failed++;
        }
      }
      return res.json({ created, failedCalls: failed, poolCount: await service.poolCount() });
    } catch (err) {
      console.log('avatar adminBatch error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Batch generation failed'));
    }
  }
}
