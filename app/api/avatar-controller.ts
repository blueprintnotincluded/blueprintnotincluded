import { Request, Response } from 'express';
import { AvatarModel } from './models/avatar';
import { UserModel, UserJwt } from './models/user';
import { AvatarService } from './services/avatar-service';
import { apiError } from './utils/apiError';

// Avatar endpoints:
//   GET    /api/users/:username/avatar   public image (256x256 png)
//   POST   /api/users/me/avatar/generate generate (optional raw image/* body as seed)
//   POST   /api/users/me/avatar/assign   claim a random unused pool avatar
//   DELETE /api/users/me/avatar          release current avatar back to pool
//   POST   /api/admin/avatars/batch      admin batch generation
export class AvatarController {
  // Generation spends real money per call; one gen per user per cooldown
  // window is the cheap in-process guard (Cloudflare handles generic rate
  // limiting, but not per-authenticated-user cost control).
  public static GENERATE_COOLDOWN_MS = 60_000;
  private lastGenerateAt = new Map<string, number>();

  constructor() {
    this.getAvatar = this.getAvatar.bind(this);
    this.generate = this.generate.bind(this);
    this.assign = this.assign.bind(this);
    this.remove = this.remove.bind(this);
    this.adminBatch = this.adminBatch.bind(this);
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

      const etag = `"avatar-${String(user.avatarId)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.set({ ETag: etag });
        return res.status(304).end();
      }
      res.set({
        'Content-Type': avatar.contentType ?? 'image/png',
        // Assignment changes swap the avatarId (new ETag), so a short shared
        // cache window is safe
        'Cache-Control': 'public, max-age=300',
        ETag: etag,
      });
      // lean() may surface the bytes as a driver Binary instead of a Buffer
      // (same handling as preview-image-service)
      const bytes: any = avatar.bytes;
      return res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer));
    } catch (err) {
      console.log('getAvatar error');
      console.log(err);
      return res.status(500).send();
    }
  }

  public async generate(req: Request, res: Response) {
    const user = req.user as UserJwt;
    const service = AvatarService.instance;

    if (!service.isEnabled()) {
      return res.status(503).json(apiError(503, 'Avatar generation is not configured'));
    }

    const last = this.lastGenerateAt.get(user._id) ?? 0;
    if (Date.now() - last < AvatarController.GENERATE_COOLDOWN_MS) {
      return res.status(429).json(apiError(429, 'Please wait before generating another avatar'));
    }
    this.lastGenerateAt.set(user._id, Date.now());

    // The route mounts express.raw({ type: 'image/*' }); any non-image body
    // arrives unparsed (req.body undefined or {}), which means "random"
    const body = req.body as unknown;
    const upload =
      Buffer.isBuffer(body) && body.length > 0
        ? { bytes: body, contentType: req.headers['content-type'] ?? 'image/jpeg' }
        : null;

    try {
      const result = await service.generateForUser(user._id, upload);
      return res.json({
        avatarId: String(result.avatar.id),
        url: `/api/users/${user.username}/avatar`,
        sourceType: result.avatar.sourceType,
        faceLikely: result.faceLikely,
      });
    } catch (err) {
      console.log('avatar generate error');
      console.log(err);
      // Allow an immediate retry after a failed (still billed? usually not
      // delivered) generation instead of holding the cooldown
      this.lastGenerateAt.delete(user._id);
      return res.status(502).json(apiError(502, 'Avatar generation failed'));
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

    const count = Number((req.body as { count?: unknown })?.count);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return res.status(400).json(apiError(400, 'count must be an integer between 1 and 20'));
    }

    try {
      const created: string[] = [];
      let failed = 0;
      // Sequential on purpose: bounds provider concurrency and keeps cost
      // linear and observable in the logs
      for (let i = 0; i < count; i++) {
        try {
          const avatar = await service.generate({ sourceType: 'seed-batch' });
          created.push(String(avatar.id));
        } catch {
          failed++;
        }
      }
      return res.json({ created, failed, poolCount: await service.poolCount() });
    } catch (err) {
      console.log('avatar adminBatch error');
      console.log(err);
      return res.status(500).json(apiError(500, 'Batch generation failed'));
    }
  }
}
