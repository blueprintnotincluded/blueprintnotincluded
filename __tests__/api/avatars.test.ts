import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import sharp from 'sharp';
import { TestSetup } from '../setup/testSetup';
import { AvatarModel } from '../../app/api/models/avatar';
import { AvatarBatchModel } from '../../app/api/models/avatar-batch';
import { AvatarSeedUploadModel } from '../../app/api/models/avatar-seed-upload';
import { UserModel } from '../../app/api/models/user';
import { AvatarService } from '../../app/api/services/avatar-service';
import {
  AvatarImageProvider,
  FaceClassification,
  GeneratedImageResult,
  ReferenceImage,
} from '../../app/api/services/gemini-avatar-provider';
import { gridAvatarPrompt, faceGridAvatarPrompt } from '../../app/api/services/avatar-prompts';

// Deterministic in-memory provider: each call returns a 512px 2x2 grid whose
// four quadrants are distinct solid colors, unique per call (so sha256 dedupe
// doesn't collapse pool avatars). Face verdict scripted per test.
class FakeProvider implements AvatarImageProvider {
  public configured = true;
  public faceLikely = false;
  public failNext = false;
  public generateCalls = 0;
  public classifyCalls = 0;
  public lastReferences: ReferenceImage[] = [];
  public counter = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  async generateImage(_prompt: string, references: ReferenceImage[] = []): Promise<GeneratedImageResult> {
    this.generateCalls++;
    this.lastReferences = references;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake provider failure');
    }
    this.counter++;
    const tile = (r: number, g: number, b: number) =>
      sharp({ create: { width: 256, height: 256, channels: 3, background: { r, g, b } } })
        .png()
        .toBuffer();
    const c = this.counter * 16;
    const tiles = await Promise.all([
      tile((c + 10) % 256, 0, 0),
      tile(0, (c + 20) % 256, 0),
      tile(0, 0, (c + 30) % 256),
      tile((c + 40) % 256, (c + 40) % 256, 0),
    ]);
    const buffer = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: tiles[0], left: 0, top: 0 },
        { input: tiles[1], left: 256, top: 0 },
        { input: tiles[2], left: 0, top: 256 },
        { input: tiles[3], left: 256, top: 256 },
      ])
      .jpeg()
      .toBuffer();
    return {
      buffer,
      mimeType: 'image/jpeg',
      model: 'fake-image-model',
      latencyMs: 5,
      interactionId: `fake-${this.counter}`,
      usage: { total_tokens: 1290 },
    };
  }

  async classifyFace(_image: ReferenceImage): Promise<FaceClassification> {
    this.classifyCalls++;
    return {
      faceLikely: this.faceLikely,
      model: 'fake-classify-model',
      rawOutput: this.faceLikely ? 'FACE' : 'NOT_FACE',
    };
  }
}

describe('Avatar generation & pool API', function () {
  let testData: any;
  let fake: FakeProvider;

  before(function () {
    AvatarModel.init();
    AvatarBatchModel.init();
    AvatarSeedUploadModel.init();
    // Refill fires asynchronously after assignments; a mid-test refill of fake
    // avatars would race the count assertions and afterEach cleanup
    process.env.AVATAR_POOL_LOW_WATER = '0';
  });

  after(function () {
    delete process.env.AVATAR_POOL_LOW_WATER;
  });

  beforeEach(async function () {
    this.timeout(10000);
    testData = await TestSetup.beforeEach();
    await AvatarModel.model.deleteMany({});
    await AvatarBatchModel.model.deleteMany({});
    await AvatarSeedUploadModel.model.deleteMany({});
    fake = new FakeProvider();
    AvatarService.setInstanceForTest(new AvatarService(fake));
  });

  afterEach(async function () {
    this.timeout(5000);
    AvatarService.setInstanceForTest(null);
    await AvatarModel.model.deleteMany({});
    await AvatarBatchModel.model.deleteMany({});
    await AvatarSeedUploadModel.model.deleteMany({});
    await TestSetup.afterEach();
  });

  // ─── Prompts ────────────────────────────────────────────────────────────────

  describe('prompt templates', function () {
    it('grid prompt varies with the rng and anchors on the ONI reference sheet', function () {
      const a = gridAvatarPrompt(() => 0.01);
      const b = gridAvatarPrompt(() => 0.99);
      expect(a).to.not.equal(b);
      expect(a).to.contain('Oxygen Not Included');
      expect(a).to.contain('2x2 grid');
      expect(a).to.contain('reference sheet');
    });

    it('face prompt asks for inspiration, not reproduction', function () {
      const prompt = faceGridAvatarPrompt();
      expect(prompt).to.contain('Do not reproduce the photo');
      expect(prompt).to.contain('second attached image');
    });
  });

  // ─── Service pipeline ───────────────────────────────────────────────────────

  describe('AvatarService.generateBatch', function () {
    it('slices one grid call into four distinct 256px avatars + a batch row', async function () {
      const service = AvatarService.instance;
      const avatars = await service.generateBatch({ sourceType: 'seed-batch' });

      expect(avatars).to.have.length(4);
      expect(fake.generateCalls).to.equal(1);

      const batch = await AvatarBatchModel.model.findById(avatars[0].batchId);
      expect(batch).to.not.be.null;
      expect(batch!.width).to.equal(512);
      expect(batch!.interactionId).to.equal('fake-1');
      expect(batch!.usage).to.deep.equal({ total_tokens: 1290 });

      const shas = new Set(avatars.map(a => a.sha256));
      expect(shas.size).to.equal(4); // all tiles distinct
      for (const [i, avatar] of avatars.entries()) {
        expect(avatar.status).to.equal('ready');
        expect(avatar.gridIndex).to.equal(i);
        expect(String(avatar.batchId)).to.equal(String(batch!._id));
        const meta = await sharp(avatar.bytes as Buffer).metadata();
        expect(meta.width).to.equal(256);
        expect(meta.height).to.equal(256);
      }
    });

    it('attaches the style sheet as the first reference', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });
      // Committed sheet exists in the repo, so it must be attached
      expect(fake.lastReferences.length).to.be.greaterThan(0);
      expect(fake.lastReferences[0].mimeType).to.equal('image/jpeg');
    });

    it('dedupes an identical grid wholesale', async function () {
      const service = AvatarService.instance;
      const first = await service.generateBatch({ sourceType: 'seed-batch' });
      fake.counter = 0; // rewind → identical grid bytes
      const second = await service.generateBatch({ sourceType: 'seed-batch' });

      expect(second.map(a => String(a._id)).sort()).to.deep.equal(
        first.map(a => String(a._id)).sort()
      );
      expect(await AvatarModel.model.countDocuments({})).to.equal(4);
      expect(await AvatarBatchModel.model.countDocuments({})).to.equal(1);
    });

    it('records failed generations as failed rows', async function () {
      const service = AvatarService.instance;
      fake.failNext = true;
      try {
        await service.generateBatch({ sourceType: 'seed-batch' });
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.message).to.contain('fake provider failure');
      }
      const failedRow = await AvatarModel.model.findOne({ status: 'failed' });
      expect(failedRow).to.not.be.null;
      expect(failedRow!.error).to.contain('fake provider failure');
      expect(failedRow!.bytes).to.be.undefined;
      expect(await AvatarBatchModel.model.countDocuments({})).to.equal(0);
    });
  });

  // ─── Pool assignment ────────────────────────────────────────────────────────

  describe('pool assignment', function () {
    it('assigns an unused avatar atomically and updates the user', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);

      const avatar = await service.assignRandomFromPool(userId);
      expect(avatar).to.not.be.null;
      expect(String(avatar!.assignedTo)).to.equal(userId);

      const user = await UserModel.model.findById(userId);
      expect(String(user!.avatarId)).to.equal(String(avatar!._id));
      expect(await service.poolCount()).to.equal(3);
    });

    it('never hands the same avatar to two users concurrently', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });

      const userIds = [
        String(testData.users.user1._id),
        String(testData.users.user2._id),
        String(testData.users.user3._id),
      ];
      const assigned = await Promise.all(userIds.map(id => service.assignRandomFromPool(id)));

      const ids = assigned.filter(a => a != null).map(a => String(a!._id));
      expect(new Set(ids).size).to.equal(ids.length); // all distinct
      expect(await service.poolCount()).to.equal(4 - ids.length);
    });

    it('returns null on an empty pool', async function () {
      const service = AvatarService.instance;
      const avatar = await service.assignRandomFromPool(String(testData.users.user1._id));
      expect(avatar).to.be.null;
    });

    it('releases the previous avatar back to the pool on reassignment', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);

      const first = await service.assignRandomFromPool(userId);
      const second = await service.assignRandomFromPool(userId);
      expect(String(first!._id)).to.not.equal(String(second!._id));

      const released = await AvatarModel.model.findById(first!._id);
      expect(released!.assignedTo).to.be.null; // reusable asset, back in pool
      expect(await service.poolCount()).to.equal(3);
    });
  });

  // ─── generateForUser (upload flow) ─────────────────────────────────────────

  describe('AvatarService.generateForUser', function () {
    async function jpegUpload(): Promise<Buffer> {
      return sharp({
        create: { width: 300, height: 400, channels: 3, background: { r: 200, g: 150, b: 100 } },
      })
        .jpeg()
        .toBuffer();
    }

    it('uses the face template when the classifier says face', async function () {
      fake.faceLikely = true;
      const userId = String(testData.users.user1._id);
      const result = await AvatarService.instance.generateForUser(userId, {
        bytes: await jpegUpload(),
        contentType: 'image/jpeg',
      });

      expect(result.faceLikely).to.equal(true);
      expect(result.candidates).to.have.length(4);
      expect(result.assigned).to.not.be.null;
      expect(String(result.assigned!._id)).to.equal(String(result.candidates[0]._id));
      expect(result.assigned!.sourceType).to.equal('user-upload');
      expect(result.assigned!.promptTemplate).to.equal('face-duplicant-grid-v2');
      expect(fake.classifyCalls).to.equal(1);
      // References: [style sheet, user photo]
      expect(fake.lastReferences).to.have.length(2);

      // Seed upload persisted and linked
      const seed = await AvatarSeedUploadModel.model.findById(result.seedUploadId);
      expect(seed).to.not.be.null;
      expect(seed!.faceLikely).to.equal(true);
      expect(String(result.assigned!.seedUploadId)).to.equal(String(seed!._id));

      const user = await UserModel.model.findById(userId);
      expect(String(user!.avatarId)).to.equal(String(result.assigned!._id));
      // The other three candidates stay claimable in the pool
      expect(await AvatarService.instance.poolCount()).to.equal(3);
    });

    it('falls back to random when the upload is not a face (upload still kept)', async function () {
      fake.faceLikely = false;
      const userId = String(testData.users.user1._id);
      const result = await AvatarService.instance.generateForUser(userId, {
        bytes: await jpegUpload(),
        contentType: 'image/jpeg',
      });

      expect(result.faceLikely).to.equal(false);
      expect(result.assigned!.sourceType).to.equal('random');
      expect(result.assigned!.promptTemplate).to.equal('duplicant-grid-v2');
      // The non-face upload is still stored — nothing paid for is discarded
      expect(await AvatarSeedUploadModel.model.countDocuments({})).to.equal(1);
    });
  });

  // ─── HTTP endpoints ────────────────────────────────────────────────────────

  describe('GET /api/users/:username/avatar', function () {
    it('404s for a user without an avatar', async function () {
      const response = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/avatar`
      );
      expect(response.status).to.equal(404);
    });

    it('serves the assigned 256px png with an ETag', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });
      await service.assignRandomFromPool(String(testData.users.user1._id));

      const response = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/avatar`
      );
      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.contain('image/png');
      expect(response.headers.etag).to.exist;
      const meta = await sharp(response.body as Buffer).metadata();
      expect(meta.width).to.equal(256);

      const cached = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/avatar`)
        .set('If-None-Match', response.headers.etag);
      expect(cached.status).to.equal(304);
    });
  });

  describe('GET /api/avatars/:id/image', function () {
    it('serves any ready avatar by id with immutable caching', async function () {
      const avatars = await AvatarService.instance.generateBatch({ sourceType: 'seed-batch' });
      const response = await TestSetup.request().get(`/api/avatars/${avatars[2].id}/image`);
      expect(response.status).to.equal(200);
      expect(response.headers['cache-control']).to.contain('immutable');
      const meta = await sharp(response.body as Buffer).metadata();
      expect(meta.width).to.equal(256);
    });

    it('404s for unknown or invalid ids', async function () {
      expect((await TestSetup.request().get('/api/avatars/not-an-id/image')).status).to.equal(404);
      expect(
        (await TestSetup.request().get('/api/avatars/0123456789abcdef01234567/image')).status
      ).to.equal(404);
    });
  });

  describe('POST /api/users/me/avatar/assign', function () {
    it('requires auth', async function () {
      const response = await TestSetup.request().post('/api/users/me/avatar/assign');
      expect(response.status).to.equal(401);
    });

    it('claims a pool avatar for the caller', async function () {
      await AvatarService.instance.generateBatch({ sourceType: 'seed-batch' });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/assign')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.avatarId).to.exist;
      expect(response.body.url).to.equal(`/api/users/${testData.users.user1.username}/avatar`);
    });

    it('404s when the pool is empty', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/assign')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(404);
    });
  });

  describe('POST /api/users/me/avatar/generate', function () {
    it('503s when the provider is not configured', async function () {
      fake.configured = false;
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(503);
    });

    it('returns four candidates and auto-assigns the first', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.sourceType).to.equal('random');
      expect(response.body.faceLikely).to.equal(null);
      expect(response.body.candidates).to.have.length(4);
      expect(response.body.avatarId).to.equal(response.body.candidates[0].id);
      expect(response.body.candidates[1].url).to.equal(
        `/api/avatars/${response.body.candidates[1].id}/image`
      );
      expect(fake.generateCalls).to.equal(1);
    });

    it('routes an image body through the seed-upload pipeline', async function () {
      fake.faceLikely = true;
      const upload = await sharp({
        create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .jpeg()
        .toBuffer();

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/jpeg')
        .send(upload);

      expect(response.status).to.equal(200);
      expect(response.body.sourceType).to.equal('user-upload');
      expect(response.body.faceLikely).to.equal(true);
      expect(response.body.candidates).to.have.length(4);
    });

    it('enforces one generation per day per user (durable, with retryAt)', async function () {
      const token = testData.users.user3.generateJwt();
      const first = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(first.status).to.equal(200);

      const second = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(second.status).to.equal(429);
      expect(second.body.retryAt).to.exist;
      // The limit is tracked on the batch row, not in process memory
      const batch = await AvatarBatchModel.model.findOne({
        requestedBy: testData.users.user3._id,
      });
      expect(batch).to.not.be.null;
    });

    it('415s on an unsupported image type instead of silently going random', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/gif')
        .send(Buffer.from('GIF89a'));
      expect(response.status).to.equal(415);
      expect(fake.generateCalls).to.equal(0);
    });

    it('400s when the body is not a decodable image (limit not consumed)', async function () {
      const token = testData.users.user1.generateJwt();
      const bad = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('not actually a png'));
      expect(bad.status).to.equal(400);
      expect(bad.body.errors[0].title).to.contain('image');

      const retry = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(retry.status).to.equal(200);
    });

    it('does not consume the daily limit on provider failure', async function () {
      fake.failNext = true;
      const token = testData.users.user1.generateJwt();
      const failed = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(failed.status).to.equal(502);

      const retry = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(retry.status).to.equal(200);
    });
  });

  describe('GET /api/users/me/avatar/status', function () {
    it('reports avatar, generation availability, and pool size', async function () {
      const token = testData.users.user1.generateJwt();
      const before = await TestSetup.request()
        .get('/api/users/me/avatar/status')
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).to.equal(200);
      expect(before.body.avatarId).to.equal(null);
      expect(before.body.nextGenerateAt).to.equal(null);
      expect(before.body.poolCount).to.equal(0);

      await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);

      const after = await TestSetup.request()
        .get('/api/users/me/avatar/status')
        .set('Authorization', `Bearer ${token}`);
      expect(after.body.avatarId).to.not.equal(null);
      expect(new Date(after.body.nextGenerateAt).getTime()).to.be.greaterThan(Date.now());
      expect(after.body.poolCount).to.equal(3); // the three unclaimed candidates
    });
  });

  describe('GET /api/avatars/available', function () {
    it('lists unused pool avatars with image urls', async function () {
      await AvatarService.instance.generateBatch({ sourceType: 'seed-batch' });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/avatars/available')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.total).to.equal(4);
      expect(response.body.avatars).to.have.length(4);
      expect(response.body.avatars[0].url).to.contain('/api/avatars/');

      // Assigned avatars drop out of the listing
      await AvatarService.instance.assignRandomFromPool(String(testData.users.user2._id));
      const trimmed = await TestSetup.request()
        .get('/api/avatars/available')
        .set('Authorization', `Bearer ${token}`);
      expect(trimmed.body.total).to.equal(3);
    });
  });

  describe('POST /api/users/me/avatar/select', function () {
    it('lets the user switch to another candidate; previous returns to pool', async function () {
      const token = testData.users.user1.generateJwt();
      const generated = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      const firstId = generated.body.avatarId;
      const otherId = generated.body.candidates[2].id;

      const response = await TestSetup.request()
        .post('/api/users/me/avatar/select')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatarId: otherId });

      expect(response.status).to.equal(200);
      const user = await UserModel.model.findById(testData.users.user1._id);
      expect(String(user!.avatarId)).to.equal(otherId);
      const previous = await AvatarModel.model.findById(firstId);
      expect(previous!.assignedTo).to.be.null;
    });

    it("409s when the avatar is another user's", async function () {
      const avatars = await AvatarService.instance.generateBatch({ sourceType: 'seed-batch' });
      await AvatarService.instance.assignSpecificAvatar(String(testData.users.user2._id), avatars[0]);

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/select')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatarId: String(avatars[0].id) });
      expect(response.status).to.equal(409);
    });

    it('400s on an invalid id', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/select')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatarId: 'nope' });
      expect(response.status).to.equal(400);
    });
  });

  describe('DELETE /api/users/me/avatar', function () {
    it('releases the avatar back to the pool', async function () {
      const service = AvatarService.instance;
      await service.generateBatch({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);
      await service.assignRandomFromPool(userId);
      expect(await service.poolCount()).to.equal(3);

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .delete('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.released).to.equal(true);
      expect(await service.poolCount()).to.equal(4);
      const user = await UserModel.model.findById(userId);
      expect(user!.avatarId).to.be.null;
    });
  });

  describe('POST /api/admin/avatars/batch', function () {
    it('403s for non-admin users', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/admin/avatars/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 2 });
      expect(response.status).to.equal(403);
    });

    it('generates whole grids for admins, capped', async function () {
      const token = testData.users.user1.generateJwt('admin');
      const response = await TestSetup.request()
        .post('/api/admin/avatars/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 5 }); // rounds up to 2 grid calls → 8 avatars

      expect(response.status).to.equal(200);
      expect(response.body.created).to.have.length(8);
      expect(response.body.failedCalls).to.equal(0);
      expect(response.body.poolCount).to.equal(8);
      expect(fake.generateCalls).to.equal(2);

      const tooMany = await TestSetup.request()
        .post('/api/admin/avatars/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 50 });
      expect(tooMany.status).to.equal(400);
    });
  });
});
