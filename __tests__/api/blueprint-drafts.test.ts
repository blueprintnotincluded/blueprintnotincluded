import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup, TestDbHelper } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { BlueprintEventModel } from '../../app/api/models/blueprint-event';

const SAMPLE_BLUEPRINT_DATA = {
  version: '1.0',
  buildings: [{ id: 'Generator', x: 0, y: 0, element: 'Coal' }],
  info: { name: 'Test', description: 'Test blueprint' },
};

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Blueprint drafts (Mocha)', function () {
  let testData: any;
  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;
  let draft: any;
  let published: any;

  before(async function () {
    this.timeout(10000);
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    ownerToken = testData.users.user1.generateJwt();
    otherToken = testData.users.user2.generateJwt();
    adminToken = testData.users.user3.generateJwt('admin');
    draft = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
      name: 'Secret Draft Base',
      isPublished: false,
    });
    published = testData.blueprints.popularBlueprint;
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // Event logging is fire-and-forget after res.json — give the insert a beat
  // to land before asserting on it
  async function events(blueprintId: any, type?: string) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const filter: any = { blueprintId };
    if (type) filter.type = type;
    return BlueprintEventModel.model.find(filter).lean();
  }

  describe('POST /api/blueprints/:id/publish and /unpublish', function () {
    it('owner publishes a draft: 200, flag set, one published event', async function () {
      const response = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.isPublished).to.equal(true);

      const doc = await BlueprintModel.model.findById(draft._id).lean();
      expect(doc!.isPublished).to.equal(true);

      const published = await events(draft._id, 'published');
      expect(published).to.have.length(1);
      expect(published[0].actorId.toString()).to.equal(testData.users.user1._id.toString());
    });

    it('republishing an already-published blueprint is idempotent: 200, no duplicate event', async function () {
      await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const response = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).to.equal(200);
      expect(await events(draft._id, 'published')).to.have.length(1);
    });

    it('owner unpublishes: 200, flag cleared, one unpublished event', async function () {
      const response = await TestSetup.request()
        .post(`/api/blueprints/${published._id}/unpublish`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.isPublished).to.equal(false);

      const doc = await BlueprintModel.model.findById(published._id).lean();
      expect(doc!.isPublished).to.equal(false);
      expect(await events(published._id, 'unpublished')).to.have.length(1);
    });

    it('admin can publish and unpublish another user\'s blueprint, attributed to the admin', async function () {
      const publishResponse = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(publishResponse.status).to.equal(200);
      const published = await events(draft._id, 'published');
      expect(published).to.have.length(1);
      expect(published[0].actorId.toString()).to.equal(testData.users.user3._id.toString());

      const unpublishResponse = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(unpublishResponse.status).to.equal(200);
      expect(unpublishResponse.body.isPublished).to.equal(false);
      const unpublished = await events(draft._id, 'unpublished');
      expect(unpublished).to.have.length(1);
      expect(unpublished[0].actorId.toString()).to.equal(testData.users.user3._id.toString());
    });

    it('another user gets 404 for a draft (existence hidden) and 403 for a published blueprint', async function () {
      const draftResponse = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(draftResponse.status).to.equal(404);

      const publishedResponse = await TestSetup.request()
        .post(`/api/blueprints/${published._id}/unpublish`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(publishedResponse.status).to.equal(403);
    });

    it('rejects anonymous (401), invalid id (400), and deleted blueprint (404)', async function () {
      const anon = await TestSetup.request().post(`/api/blueprints/${draft._id}/publish`);
      expect(anon.status).to.equal(401);

      const badId = await TestSetup.request()
        .post('/api/blueprints/not-an-id/publish')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(badId.status).to.equal(400);

      await BlueprintModel.model.updateOne({ _id: draft._id }, { deletedAt: new Date() });
      const deleted = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(deleted.status).to.equal(404);
    });
  });

  describe('upload lifecycle events', function () {
    it('new upload without publish starts as a draft with a created event only', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Fresh Draft',
          blueprint: SAMPLE_BLUEPRINT_DATA,
          thumbnail: TINY_PNG,
          overwrite: false,
        });

      expect(response.status).to.equal(200);
      const doc = await BlueprintModel.model.findById(response.body.id).lean();
      expect(doc!.isPublished).to.equal(false);

      expect(await events(response.body.id, 'created')).to.have.length(1);
      expect(await events(response.body.id, 'published')).to.have.length(0);
    });

    it('new upload with publish:true is published with created + published events', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Instant Publish',
          blueprint: SAMPLE_BLUEPRINT_DATA,
          thumbnail: TINY_PNG,
          overwrite: false,
          publish: true,
        });

      expect(response.status).to.equal(200);
      const doc = await BlueprintModel.model.findById(response.body.id).lean();
      expect(doc!.isPublished).to.equal(true);

      expect(await events(response.body.id, 'created')).to.have.length(1);
      expect(await events(response.body.id, 'published')).to.have.length(1);
    });

    it('overwrite save logs updated and preserves publish state; publish:true on a draft publishes', async function () {
      const overwrite = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Secret Draft Base',
          blueprint: SAMPLE_BLUEPRINT_DATA,
          thumbnail: TINY_PNG,
          overwrite: true,
        });
      expect(overwrite.status).to.equal(200);
      let doc = await BlueprintModel.model.findById(draft._id).lean();
      expect(doc!.isPublished).to.equal(false);
      expect(await events(draft._id, 'updated')).to.have.length(1);

      const publishSave = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Secret Draft Base',
          blueprint: SAMPLE_BLUEPRINT_DATA,
          thumbnail: TINY_PNG,
          overwrite: true,
          publish: true,
        });
      expect(publishSave.status).to.equal(200);
      doc = await BlueprintModel.model.findById(draft._id).lean();
      expect(doc!.isPublished).to.equal(true);
      expect(await events(draft._id, 'published')).to.have.length(1);
    });

    it('delete logs a deleted event', async function () {
      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ blueprintId: draft._id.toString() });

      expect(response.status).to.equal(200);
      expect(await events(draft._id, 'deleted')).to.have.length(1);
    });
  });

  describe('feed visibility', function () {
    it('anonymous browse excludes drafts', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Secret Draft Base');
      expect(names).to.include('Super Coal Generator Setup');
    });

    it('owner sees own drafts (flagged) via the secure route', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ olderthan: Date.now(), filterUserId: testData.users.user1._id.toString() });

      expect(response.status).to.equal(200);
      const draftItem = response.body.blueprints.find((bp: any) => bp.name === 'Secret Draft Base');
      expect(draftItem).to.exist;
      expect(draftItem.isPublished).to.equal(false);

      const publishedItem = response.body.blueprints.find(
        (bp: any) => bp.name === 'Super Coal Generator Setup'
      );
      expect(publishedItem.isPublished).to.equal(true);
    });

    it('another authenticated viewer browsing that user\'s list sees only published', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${otherToken}`)
        .query({ olderthan: Date.now(), filterUserId: testData.users.user1._id.toString() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Secret Draft Base');
      expect(names).to.include('Super Coal Generator Setup');
    });

    it('admin browsing a specific user\'s list sees that user\'s drafts', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ olderthan: Date.now(), filterUserId: testData.users.user1._id.toString() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Secret Draft Base');
    });

    it('admin general feed (no filterUserId) does not include other users\' drafts', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Secret Draft Base');
    });
  });

  describe('direct access to a draft', function () {
    it('404s for anonymous and other users on every read endpoint; 200 for owner and admin', async function () {
      this.timeout(10000);
      const id = draft._id.toString();
      // getblueprintmod/getblueprintthumbnail 500 on the synthetic fixture
      // data (not a real MdbBlueprint) once past the gate — assert "not 404"
      // for owner/admin there instead of 200
      const readEndpoints = [
        { url: `/api/blueprints/${id}`, passStatus: 200 },
        { url: `/api/getblueprint/${id}`, passStatus: 200 },
        { url: `/api/getblueprintmod/${id}`, passStatus: null },
        { url: `/api/getblueprintthumbnail/${id}`, passStatus: null },
        { url: `/api/blueprints/${id}/versions`, passStatus: 200 },
        { url: `/api/blueprints/${id}/comments`, passStatus: 200 },
      ];

      for (const { url, passStatus } of readEndpoints) {
        const anon = await TestSetup.request().get(url);
        expect(anon.status, `anon ${url}`).to.equal(404);

        const other = await TestSetup.request()
          .get(url)
          .set('Authorization', `Bearer ${otherToken}`);
        expect(other.status, `other ${url}`).to.equal(404);

        const owner = await TestSetup.request()
          .get(url)
          .set('Authorization', `Bearer ${ownerToken}`);
        if (passStatus != null) expect(owner.status, `owner ${url}`).to.equal(passStatus);
        else expect(owner.status, `owner ${url}`).to.not.equal(404);

        const admin = await TestSetup.request()
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`);
        if (passStatus != null) expect(admin.status, `admin ${url}`).to.equal(passStatus);
        else expect(admin.status, `admin ${url}`).to.not.equal(404);
      }
    });

    it('preview 404s for others; owner gets it with Cache-Control: private, no-store', async function () {
      const id = draft._id.toString();

      const anon = await TestSetup.request().get(`/api/blueprints/${id}/preview/card.webp`);
      expect(anon.status).to.equal(404);

      const owner = await TestSetup.request()
        .get(`/api/blueprints/${id}/preview/card.webp`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(owner.status).to.equal(200);
      expect(owner.headers['cache-control']).to.equal('private, no-store');
    });

    it('details response carries isPublished for the owner', async function () {
      const response = await TestSetup.request()
        .get(`/api/blueprints/${draft._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.isPublished).to.equal(false);
    });

    it('liking a draft: 404 for others, allowed for the owner', async function () {
      const other = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ blueprintId: draft._id.toString(), like: true });
      expect(other.status).to.equal(404);

      const owner = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ blueprintId: draft._id.toString(), like: true });
      expect(owner.status).to.equal(200);
    });

    it('forking a draft: 404 for others; owner fork is itself a draft with a created event', async function () {
      const other = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/fork`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(other.status).to.equal(404);

      const owner = await TestSetup.request()
        .post(`/api/blueprints/${draft._id}/fork`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(owner.status).to.equal(200);

      const fork = await BlueprintModel.model.findById(owner.body.id).lean();
      expect(fork!.isPublished).to.equal(false);
      expect(await events(owner.body.id, 'created')).to.have.length(1);
    });

    it('forking a published blueprint produces a draft fork', async function () {
      const response = await TestSetup.request()
        .post(`/api/blueprints/${published._id}/fork`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).to.equal(200);

      const fork = await BlueprintModel.model.findById(response.body.id).lean();
      expect(fork!.isPublished).to.equal(false);
    });
  });
});
