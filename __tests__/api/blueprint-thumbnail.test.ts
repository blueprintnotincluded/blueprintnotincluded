import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import mongoose, { Types } from 'mongoose';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup, TestDbHelper } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

const thumbnailTypeMigration = require('../../migrations/20260717000000_blueprint-thumbnail-type.js');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG = `data:image/png;base64,${TINY_PNG_BASE64}`;

const SAMPLE_BLUEPRINT_DATA = {
  version: '1.0',
  buildings: [{ id: 'Generator', x: 0, y: 0, element: 'Coal' }],
  info: { name: 'Test', description: 'Test blueprint' },
};

describe('Blueprint thumbnails (slim lists)', function () {
  let testData: any;
  let blueprintId: string;

  before(async function () {
    this.timeout(10000);
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    blueprintId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/blueprints/:id/thumbnail', function () {
    it('serves the stored data URI decoded to binary with its own mime type', async function () {
      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/thumbnail`);

      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/image\/png/);
      expect(response.headers['cache-control']).to.equal('public, max-age=86400');
      expect(Buffer.from(response.body).equals(Buffer.from(TINY_PNG_BASE64, 'base64'))).to.equal(
        true
      );
    });

    it('does not assume png — a jpeg data URI comes back as image/jpeg', async function () {
      const jpeg = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Jpeg Thumb',
        thumbnail: `data:image/jpeg;base64,${TINY_PNG_BASE64}`,
      });

      const response = await TestSetup.request().get(`/api/blueprints/${jpeg._id}/thumbnail`);
      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/image\/jpeg/);
    });

    it('serves 304 when the ETag matches', async function () {
      const first = await TestSetup.request().get(`/api/blueprints/${blueprintId}/thumbnail`);
      expect(first.headers['etag']).to.contain(blueprintId);

      const response = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}/thumbnail`)
        .set('If-None-Match', first.headers['etag']);
      expect(response.status).to.equal(304);
    });

    it('404s for sentinel thumbnails', async function () {
      for (const sentinel of ['svg', 'svg_nothing']) {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: `Sentinel ${sentinel}`,
          thumbnail: sentinel,
          thumbnailType: sentinel as any,
        });
        const response = await TestSetup.request().get(`/api/blueprints/${doc._id}/thumbnail`);
        expect(response.status, sentinel).to.equal(404);
      }
    });

    it('rejects malformed ids and 404s missing/deleted blueprints', async function () {
      expect(
        (await TestSetup.request().get('/api/blueprints/not-an-id/thumbnail')).status
      ).to.equal(400);
      expect(
        (await TestSetup.request().get(`/api/blueprints/${new Types.ObjectId()}/thumbnail`)).status
      ).to.equal(404);

      await BlueprintModel.model.updateOne({ _id: blueprintId }, { deletedAt: new Date() });
      expect(
        (await TestSetup.request().get(`/api/blueprints/${blueprintId}/thumbnail`)).status
      ).to.equal(404);
    });

    it('gates drafts: 404 for anon and other users, 200 (never shared-cached) for owner and admin', async function () {
      const draft = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Draft Thumb',
        isPublished: false,
      });
      const url = `/api/blueprints/${draft._id}/thumbnail`;

      expect((await TestSetup.request().get(url)).status).to.equal(404);

      const otherToken = testData.users.user2.generateJwt();
      expect(
        (await TestSetup.request().get(url).set('Authorization', `Bearer ${otherToken}`)).status
      ).to.equal(404);

      const ownerToken = testData.users.user1.generateJwt();
      const owner = await TestSetup.request().get(url).set('Authorization', `Bearer ${ownerToken}`);
      expect(owner.status).to.equal(200);
      expect(owner.headers['cache-control']).to.equal('private, no-store');

      const adminToken = testData.users.user3.generateJwt('admin');
      expect(
        (await TestSetup.request().get(url).set('Authorization', `Bearer ${adminToken}`)).status
      ).to.equal(200);
    });
  });

  describe('list responses carry the sentinel, never the blob', function () {
    it('sends thumbnail: "real" for real thumbnails and no data URI anywhere in the page', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      expect(response.body.blueprints.length).to.be.greaterThan(0);
      for (const item of response.body.blueprints) {
        expect(item.thumbnail).to.equal('real');
      }
      expect(JSON.stringify(response.body)).to.not.contain('data:image');
    });

    it('passes stored sentinels through and treats missing thumbnailType as real', async function () {
      // Sentinel doc (post-migration shape)
      await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Sentinel Listed',
        thumbnail: 'svg',
        thumbnailType: 'svg',
      });
      // The seeded fixtures have no thumbnailType at all (the deploy-to-
      // migration window) — they must read as 'real', not undefined.
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      const byName = new Map(
        response.body.blueprints.map((item: any) => [item.name, item.thumbnail])
      );
      expect(byName.get('Sentinel Listed')).to.equal('svg');
      expect(byName.get('Super Coal Generator Setup')).to.equal('real');
    });
  });

  describe('write sites set thumbnailType', function () {
    it('upload stores real vs sentinel discriminators', async function () {
      const token = testData.users.user1.generateJwt();

      const real = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Real Upload', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });
      expect(real.status).to.equal(200);
      expect((await BlueprintModel.model.findById(real.body.id).lean())!.thumbnailType).to.equal(
        'real'
      );

      const sentinel = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Sentinel Upload', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: 'svg' });
      expect(sentinel.status).to.equal(200);
      expect(
        (await BlueprintModel.model.findById(sentinel.body.id).lean())!.thumbnailType
      ).to.equal('svg');
    });

    it('forking stores the discriminator for the copied thumbnail', async function () {
      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/fork`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(200);

      const fork = await BlueprintModel.model.findById(response.body.id).lean();
      expect(fork!.thumbnailType).to.equal('real');
    });
  });

  describe('migration 20260717000000_blueprint-thumbnail-type', function () {
    it('backfills from the stored thumbnail value and is idempotent', async function () {
      const db = mongoose.connection.db!;
      await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Sentinel Doc',
        thumbnail: 'svg_nothing',
      });

      await thumbnailTypeMigration.up(db);
      await thumbnailTypeMigration.up(db);

      expect(await BlueprintModel.model.countDocuments({ thumbnailType: { $exists: false } })).to.equal(0);
      const sentinelDoc = await BlueprintModel.model.findOne({ name: 'Sentinel Doc' }).lean();
      expect(sentinelDoc!.thumbnailType).to.equal('svg_nothing');
      const realDoc = await BlueprintModel.model.findById(blueprintId).lean();
      expect(realDoc!.thumbnailType).to.equal('real');
    });

    it('leaves documents that already have a discriminator untouched', async function () {
      const db = mongoose.connection.db!;
      // A doc written by the new code whose thumbnail was later hand-edited to
      // a sentinel string must keep its stored discriminator.
      await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Already Typed',
        thumbnail: 'svg',
        thumbnailType: 'real',
      });

      await thumbnailTypeMigration.up(db);

      const doc = await BlueprintModel.model.findOne({ name: 'Already Typed' }).lean();
      expect(doc!.thumbnailType).to.equal('real');
    });

    it('down unsets the discriminator everywhere', async function () {
      const db = mongoose.connection.db!;
      await thumbnailTypeMigration.up(db);
      await thumbnailTypeMigration.down(db);
      expect(await BlueprintModel.model.countDocuments({ thumbnailType: { $exists: true } })).to.equal(0);
    });
  });
});
