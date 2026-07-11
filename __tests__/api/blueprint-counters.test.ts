import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { BlueprintCounterService } from '../../app/api/services/blueprint-counter-service';
import { Types } from 'mongoose';

describe('Blueprint view/download counters', function () {
  let testData: any;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    blueprintId = testData.blueprints.popularBlueprint._id.toString();
    BlueprintCounterService.instance.reset();
  });

  afterEach(async function () {
    this.timeout(5000);
    BlueprintCounterService.instance.reset();
    await TestSetup.afterEach();
  });

  async function counts(id: string) {
    const doc = await BlueprintModel.model.findById(id).select('viewCount downloadCount').lean();
    return { views: doc?.viewCount ?? 0, downloads: doc?.downloadCount ?? 0 };
  }

  describe('BlueprintCounterService', function () {
    it('accumulates increments in memory and only writes on flush', async function () {
      const service = BlueprintCounterService.instance;
      service.record('view', blueprintId, 'user-a');
      service.record('view', blueprintId, 'user-b');
      service.record('download', blueprintId, 'user-a');

      expect(await counts(blueprintId)).to.deep.equal({ views: 0, downloads: 0 });

      await service.flush();
      expect(await counts(blueprintId)).to.deep.equal({ views: 2, downloads: 1 });

      // Nothing pending — flushing again must not double-write
      await service.flush();
      expect(await counts(blueprintId)).to.deep.equal({ views: 2, downloads: 1 });
    });

    it('dedupes repeat hits from the same viewer within the TTL window', async function () {
      const service = BlueprintCounterService.instance;
      expect(service.record('view', blueprintId, 'user-a')).to.equal(true);
      expect(service.record('view', blueprintId, 'user-a')).to.equal(false);
      // Different kind and different viewer are independent
      expect(service.record('download', blueprintId, 'user-a')).to.equal(true);
      expect(service.record('view', blueprintId, 'user-b')).to.equal(true);

      await service.flush();
      expect(await counts(blueprintId)).to.deep.equal({ views: 2, downloads: 1 });
    });

    it('counts again once the dedupe TTL has expired', async function () {
      const service = BlueprintCounterService.instance;
      const originalTtl = BlueprintCounterService.DEDUPE_TTL_MS;
      try {
        BlueprintCounterService.DEDUPE_TTL_MS = -1; // every entry is already expired
        expect(service.record('view', blueprintId, 'user-a')).to.equal(true);
        expect(service.record('view', blueprintId, 'user-a')).to.equal(true);
      } finally {
        BlueprintCounterService.DEDUPE_TTL_MS = originalTtl;
      }
    });

    it('survives a flush against a deleted blueprint id', async function () {
      const service = BlueprintCounterService.instance;
      service.record('view', new Types.ObjectId().toString(), 'user-a');
      await service.flush(); // must not throw
    });
  });

  describe('view recording', function () {
    it('counts a details-page fetch once per anonymous viewer, editor open deduped', async function () {
      await TestSetup.request().get(`/api/blueprints/${blueprintId}`);
      await TestSetup.request().get(`/api/blueprints/${blueprintId}`);
      // Editor open from the same client inside the window: same dedupe key
      await TestSetup.request().get(`/api/getblueprint/${blueprintId}`);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).views).to.equal(1);
    });

    it('does not count the owner viewing their own blueprint', async function () {
      await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user1.generateJwt()}`);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).views).to.equal(0);
    });

    it('counts distinct logged-in viewers separately', async function () {
      await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user2.generateJwt()}`);
      await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user3.generateJwt()}`);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).views).to.equal(2);
    });

    it('never counts draft views', async function () {
      await BlueprintModel.model.updateOne({ _id: blueprintId }, { isPublished: false });
      await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user1.generateJwt()}`);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).views).to.equal(0);
    });
  });

  describe('download recording', function () {
    it('POST /api/blueprints/:id/downloads records a deduped download', async function () {
      const first = await TestSetup.request().post(`/api/blueprints/${blueprintId}/downloads`);
      expect(first.status).to.equal(204);
      const repeat = await TestSetup.request().post(`/api/blueprints/${blueprintId}/downloads`);
      expect(repeat.status).to.equal(204);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).downloads).to.equal(1);
    });

    it('validates the beacon id and hides unknown/deleted blueprints', async function () {
      expect((await TestSetup.request().post('/api/blueprints/nope/downloads')).status).to.equal(400);
      expect(
        (await TestSetup.request().post(`/api/blueprints/${new Types.ObjectId()}/downloads`)).status
      ).to.equal(404);

      await BlueprintModel.model.updateOne({ _id: blueprintId }, { deletedAt: new Date() });
      expect(
        (await TestSetup.request().post(`/api/blueprints/${blueprintId}/downloads`)).status
      ).to.equal(404);
    });

    it('counts the ONI mod fetching a blueprint as a download', async function () {
      // The generic seed fixture isn't a convertible MdbBlueprint (the mod
      // endpoint 500s on it, and failed serves must not count) — swap in the
      // minimal valid shape first
      await BlueprintModel.model.updateOne(
        { _id: blueprintId },
        { $set: { data: { blueprintItems: [] } } }
      );
      const response = await TestSetup.request().get(`/api/getblueprintmod/${blueprintId}`);
      expect(response.status).to.equal(200);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).downloads).to.equal(1);
    });

    it('does not count the owner downloading their own blueprint', async function () {
      await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/downloads`)
        .set('Authorization', `Bearer ${testData.users.user1.generateJwt()}`);

      await BlueprintCounterService.instance.flush();
      expect((await counts(blueprintId)).downloads).to.equal(0);
    });
  });

  describe('exposure in responses', function () {
    it('returns nbViews/nbDownloads on details and list payloads', async function () {
      await BlueprintModel.model.updateOne(
        { _id: blueprintId },
        { $set: { viewCount: 42, downloadCount: 7 } }
      );

      const details = await TestSetup.request().get(`/api/blueprints/${blueprintId}`);
      expect(details.body.nbViews).to.equal(42);
      expect(details.body.nbDownloads).to.equal(7);

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });
      const item = list.body.blueprints.find((entry: any) => entry.id === blueprintId);
      expect(item.nbViews).to.equal(42);
      expect(item.nbDownloads).to.equal(7);
    });

    it('sorts by view and download counts', async function () {
      const otherId = testData.blueprints.recentBlueprint._id.toString();
      await BlueprintModel.model.updateOne({ _id: blueprintId }, { $set: { viewCount: 10 } });
      await BlueprintModel.model.updateOne(
        { _id: otherId },
        { $set: { viewCount: 99, downloadCount: 99 } }
      );

      const byViews = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'mostViewed' });
      expect(byViews.status).to.equal(200);
      expect(byViews.body.blueprints[0].id).to.equal(otherId);

      const byDownloads = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'mostDownloaded' });
      expect(byDownloads.status).to.equal(200);
      expect(byDownloads.body.blueprints[0].id).to.equal(otherId);

      expect(
        (
          await TestSetup.request()
            .get('/api/getblueprints')
            .query({ olderthan: Date.now(), sort: 'bogus' })
        ).status
      ).to.equal(400);
    });
  });
});
