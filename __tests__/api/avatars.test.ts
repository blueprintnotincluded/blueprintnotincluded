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
import { AvatarSeedUploadModel } from '../../app/api/models/avatar-seed-upload';
import { UserModel } from '../../app/api/models/user';
import { AvatarService } from '../../app/api/services/avatar-service';
import {
  AvatarImageProvider,
  FaceClassification,
  GeneratedImageResult,
  ReferenceImage,
} from '../../app/api/services/gemini-avatar-provider';
import { randomAvatarPrompt, faceAvatarPrompt } from '../../app/api/services/avatar-prompts';

// Deterministic in-memory provider: unique PNG per call (so sha256 dedupe
// doesn't collapse pool avatars), face verdict scripted per test.
class FakeProvider implements AvatarImageProvider {
  public configured = true;
  public faceLikely = false;
  public failNext = false;
  public generateCalls = 0;
  public classifyCalls = 0;
  private counter = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  async generateImage(_prompt: string, _reference?: ReferenceImage): Promise<GeneratedImageResult> {
    this.generateCalls++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake provider failure');
    }
    this.counter++;
    // Unique solid-color 512px png per call
    const buffer = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: { r: (this.counter * 37) % 256, g: (this.counter * 91) % 256, b: 128 },
      },
    })
      .png()
      .toBuffer();
    return {
      buffer,
      mimeType: 'image/png',
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
    await AvatarSeedUploadModel.model.deleteMany({});
    fake = new FakeProvider();
    AvatarService.setInstanceForTest(new AvatarService(fake));
  });

  afterEach(async function () {
    this.timeout(5000);
    AvatarService.setInstanceForTest(null);
    await AvatarModel.model.deleteMany({});
    await AvatarSeedUploadModel.model.deleteMany({});
    await TestSetup.afterEach();
  });

  // ─── Prompts ────────────────────────────────────────────────────────────────

  describe('prompt templates', function () {
    it('random prompt varies with the rng and stays duplicant-styled', function () {
      const a = randomAvatarPrompt(() => 0.01);
      const b = randomAvatarPrompt(() => 0.99);
      expect(a).to.not.equal(b);
      expect(a).to.contain('Oxygen Not Included');
      expect(a).to.contain('avatar');
    });

    it('face prompt asks for inspiration, not reproduction', function () {
      expect(faceAvatarPrompt()).to.contain('Do not reproduce the photo');
    });
  });

  // ─── Service pipeline ───────────────────────────────────────────────────────

  describe('AvatarService.generate', function () {
    it('stores original + 256px derivative + metadata', async function () {
      const service = AvatarService.instance;
      const avatar = await service.generate({ sourceType: 'random' });

      expect(avatar.status).to.equal('ready');
      expect(avatar.providerModel).to.equal('fake-image-model');
      expect(avatar.promptTemplate).to.equal('random-duplicant-v1');
      expect(avatar.sha256).to.have.length(64);
      expect(avatar.width).to.equal(256);
      expect(avatar.originalWidth).to.equal(512);
      expect(avatar.interactionId).to.equal('fake-1');
      const displayMeta = await sharp(avatar.bytes as Buffer).metadata();
      expect(displayMeta.width).to.equal(256);
      expect(displayMeta.height).to.equal(256);
    });

    it('dedupes identical provider output by sha256', async function () {
      const service = AvatarService.instance;
      const first = await service.generate({ sourceType: 'random' });
      // Same counter output again: rewind the fake
      (fake as any).counter = 0;
      const second = await service.generate({ sourceType: 'random' });
      expect(String(second._id)).to.equal(String(first._id));
      expect(await AvatarModel.model.countDocuments({})).to.equal(1);
    });

    it('records failed generations as failed rows', async function () {
      const service = AvatarService.instance;
      fake.failNext = true;
      try {
        await service.generate({ sourceType: 'random' });
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.message).to.contain('fake provider failure');
      }
      const failedRow = await AvatarModel.model.findOne({ status: 'failed' });
      expect(failedRow).to.not.be.null;
      expect(failedRow!.error).to.contain('fake provider failure');
      expect(failedRow!.bytes).to.be.undefined;
    });
  });

  // ─── Pool assignment ────────────────────────────────────────────────────────

  describe('pool assignment', function () {
    it('assigns an unused avatar atomically and updates the user', async function () {
      const service = AvatarService.instance;
      await service.generate({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);

      const avatar = await service.assignRandomFromPool(userId);
      expect(avatar).to.not.be.null;
      expect(String(avatar!.assignedTo)).to.equal(userId);

      const user = await UserModel.model.findById(userId);
      expect(String(user!.avatarId)).to.equal(String(avatar!._id));
      expect(await service.poolCount()).to.equal(0);
    });

    it('never hands the same avatar to two users concurrently', async function () {
      const service = AvatarService.instance;
      await service.generate({ sourceType: 'seed-batch' });
      await service.generate({ sourceType: 'seed-batch' });
      await service.generate({ sourceType: 'seed-batch' });

      const userIds = [
        String(testData.users.user1._id),
        String(testData.users.user2._id),
        String(testData.users.user3._id),
      ];
      const assigned = await Promise.all(userIds.map(id => service.assignRandomFromPool(id)));

      const ids = assigned.filter(a => a != null).map(a => String(a!._id));
      expect(new Set(ids).size).to.equal(ids.length); // all distinct
      expect(await service.poolCount()).to.equal(3 - ids.length);
    });

    it('returns null on an empty pool', async function () {
      const service = AvatarService.instance;
      const avatar = await service.assignRandomFromPool(String(testData.users.user1._id));
      expect(avatar).to.be.null;
    });

    it('releases the previous avatar back to the pool on reassignment', async function () {
      const service = AvatarService.instance;
      await service.generate({ sourceType: 'seed-batch' });
      await service.generate({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);

      const first = await service.assignRandomFromPool(userId);
      const second = await service.assignRandomFromPool(userId);
      expect(String(first!._id)).to.not.equal(String(second!._id));

      const released = await AvatarModel.model.findById(first!._id);
      expect(released!.assignedTo).to.be.null; // reusable asset, back in pool
      expect(await service.poolCount()).to.equal(1);
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
      expect(result.avatar.sourceType).to.equal('user-upload');
      expect(result.avatar.promptTemplate).to.equal('face-duplicant-v1');
      expect(fake.classifyCalls).to.equal(1);

      // Seed upload persisted and linked
      const seed = await AvatarSeedUploadModel.model.findById(result.seedUploadId);
      expect(seed).to.not.be.null;
      expect(seed!.faceLikely).to.equal(true);
      expect(String(result.avatar.seedUploadId)).to.equal(String(seed!._id));

      const user = await UserModel.model.findById(userId);
      expect(String(user!.avatarId)).to.equal(String(result.avatar._id));
    });

    it('falls back to random when the upload is not a face (upload still kept)', async function () {
      fake.faceLikely = false;
      const userId = String(testData.users.user1._id);
      const result = await AvatarService.instance.generateForUser(userId, {
        bytes: await jpegUpload(),
        contentType: 'image/jpeg',
      });

      expect(result.faceLikely).to.equal(false);
      expect(result.avatar.sourceType).to.equal('random');
      expect(result.avatar.promptTemplate).to.equal('random-duplicant-v1');
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
      await service.generate({ sourceType: 'seed-batch' });
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

  describe('POST /api/users/me/avatar/assign', function () {
    it('requires auth', async function () {
      const response = await TestSetup.request().post('/api/users/me/avatar/assign');
      expect(response.status).to.equal(401);
    });

    it('claims a pool avatar for the caller', async function () {
      await AvatarService.instance.generate({ sourceType: 'seed-batch' });
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

    it('generates a random avatar without a body', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.sourceType).to.equal('random');
      expect(response.body.faceLikely).to.equal(null);
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
    });

    it('rate-limits repeat generation per user', async function () {
      const token = testData.users.user3.generateJwt();
      const first = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(first.status).to.equal(200);

      const second = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`);
      expect(second.status).to.equal(429);
    });
  });

  describe('DELETE /api/users/me/avatar', function () {
    it('releases the avatar back to the pool', async function () {
      const service = AvatarService.instance;
      await service.generate({ sourceType: 'seed-batch' });
      const userId = String(testData.users.user1._id);
      await service.assignRandomFromPool(userId);
      expect(await service.poolCount()).to.equal(0);

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .delete('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.released).to.equal(true);
      expect(await service.poolCount()).to.equal(1);
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

    it('generates a capped batch for admins', async function () {
      const token = testData.users.user1.generateJwt('admin');
      const response = await TestSetup.request()
        .post('/api/admin/avatars/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 3 });

      expect(response.status).to.equal(200);
      expect(response.body.created).to.have.length(3);
      expect(response.body.failed).to.equal(0);
      expect(response.body.poolCount).to.equal(3);

      const tooMany = await TestSetup.request()
        .post('/api/admin/avatars/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 50 });
      expect(tooMany.status).to.equal(400);
    });
  });
});
