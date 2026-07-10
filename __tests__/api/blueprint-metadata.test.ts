import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const BASE_BODY = {
  name: 'Meta Test Blueprint',
  blueprint: { version: '1.0', buildings: [] },
  thumbnail: TINY_PNG,
  // These tests exercise the public list/filter API — uploads must be
  // published to appear there (new uploads default to draft)
  publish: true,
};

describe('Blueprint metadata API', function () {
  let authToken: string;
  let testData: any;

  beforeEach(async function () {
    this.timeout(15000);
    testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('POST /api/uploadblueprint — metadata fields', function () {
    it('persists valid metadata and round-trips through list API', async function () {
      const upload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...BASE_BODY,
          gameVersion: 'spacedOut',
          category: 'power',
          subcategory: 'generator',
          description: 'A great power setup',
          researchTier: 'advanced',
          modded: true,
        });

      expect(upload.status).to.equal(200);
      const id = upload.body.id;

      const saved = await BlueprintModel.model.findById(id);
      expect(saved!.gameVersion).to.equal('spacedOut');
      expect(saved!.category).to.equal('power');
      expect(saved!.subcategory).to.equal('generator');
      expect(saved!.description).to.equal('A great power setup');
      expect(saved!.researchTier).to.equal('advanced');
      expect(saved!.modded).to.be.true;

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(list.status).to.equal(200);
      const item = list.body.blueprints.find((bp: any) => bp.id === id);
      expect(item).to.exist;
      expect(item.gameVersion).to.equal('spacedOut');
      expect(item.category).to.equal('power');
      expect(item.description).to.equal('A great power setup');
      expect(item.modded).to.be.true;
    });

    it('saves with null metadata when fields omitted', async function () {
      const upload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send(BASE_BODY);

      expect(upload.status).to.equal(200);

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      const item = list.body.blueprints.find((bp: any) => bp.name === 'Meta Test Blueprint');
      expect(item).to.exist;
      expect(item.gameVersion ?? null).to.be.null;
      expect(item.category ?? null).to.be.null;
    });

    it('accepts the food and rooms categories added for auto-classification', async function () {
      const foodUpload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Food Category Blueprint', category: 'food', subcategory: 'farm' });

      expect(foodUpload.status).to.equal(200);
      const foodSaved = await BlueprintModel.model.findById(foodUpload.body.id);
      expect(foodSaved!.category).to.equal('food');
      expect(foodSaved!.subcategory).to.equal('farm');

      const roomsUpload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Rooms Category Blueprint', category: 'rooms', subcategory: 'barracks' });

      expect(roomsUpload.status).to.equal(200);
      const roomsSaved = await BlueprintModel.model.findById(roomsUpload.body.id);
      expect(roomsSaved!.category).to.equal('rooms');
      expect(roomsSaved!.subcategory).to.equal('barracks');
    });

    it('rejects unknown gameVersion with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, gameVersion: 'notARealVersion' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects unknown category with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, category: 'magic' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects subcategory that does not belong to category with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, category: 'power', subcategory: 'electrolyzer' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects subcategory without category with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, subcategory: 'generator' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects unknown researchTier with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, researchTier: 'superAdvanced' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects description over 500 characters with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, description: 'x'.repeat(501) });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });
  });

  describe('GET /api/getblueprints — facet filter params', function () {
    beforeEach(async function () {
      // Seed two tagged blueprints
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Power Blueprint', gameVersion: 'base', category: 'power' });

      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Oxygen Blueprint', gameVersion: 'spacedOut', category: 'oxygenGen' });
    });

    it('filters by gameVersion', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'base' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Power Blueprint');
      expect(names).to.not.include('Oxygen Blueprint');
    });

    it('filters by category', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'oxygenGen' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Oxygen Blueprint');
      expect(names).to.not.include('Power Blueprint');
    });

    it('filters by gameVersion and category together', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'spacedOut', category: 'oxygenGen' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Oxygen Blueprint');
      expect(names).to.not.include('Power Blueprint');
    });

    it('returns 400 for unknown gameVersion filter', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'notAVersion' });

      expect(response.status).to.equal(400);
    });

    it('returns 400 for unknown category filter', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'notACategory' });

      expect(response.status).to.equal(400);
    });

    it('untagged blueprints are excluded when a category filter is active', async function () {
      // Seed an untagged blueprint
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Untagged Blueprint' });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'power' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Untagged Blueprint');
    });

    it('filters by modded=true', async function () {
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Modded Blueprint', modded: true });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), modded: 'true' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Modded Blueprint');
      expect(names).to.not.include('Power Blueprint');
      expect(names).to.not.include('Oxygen Blueprint');
    });

    it('filters by modded=false, excluding both modded=true and untagged (null) blueprints', async function () {
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Modded Blueprint', modded: true });
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Explicitly Unmodded Blueprint', modded: false });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), modded: 'false' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Explicitly Unmodded Blueprint');
      expect(names).to.not.include('Modded Blueprint');
      expect(names).to.not.include('Power Blueprint'); // modded left null, not false
    });

    it('returns 400 for an invalid modded value', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), modded: 'yes' });

      expect(response.status).to.equal(400);
    });
  });

  describe('GET /api/getblueprints — forkedFrom filter', function () {
    it('returns only forks of the given blueprint', async function () {
      const source = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Fork Source' });
      const sourceId = source.body.id;

      const forkResponse = await TestSetup.request()
        .post(`/api/blueprints/${sourceId}/fork`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(forkResponse.status).to.equal(200);

      // Forks start as drafts — publish so it shows in the public list
      await TestSetup.request()
        .post(`/api/blueprints/${forkResponse.body.id}/publish`)
        .set('Authorization', `Bearer ${authToken}`);

      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Unrelated Blueprint' });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), forkedFrom: sourceId });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Fork Source fork');
      expect(names).to.not.include('Fork Source');
      expect(names).to.not.include('Unrelated Blueprint');
    });

    it('returns 400 for a malformed forkedFrom id', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), forkedFrom: 'not-an-id' });

      expect(response.status).to.equal(400);
    });
  });

  describe('GET /api/getblueprints — likedBy filter', function () {
    it('returns only blueprints liked by the given user, for that user themselves', async function () {
      const otherToken = testData.users.user2.generateJwt();

      const liked = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Liked By User2' });
      await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ blueprintId: liked.body.id, like: true });

      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Not Liked By User2' });

      // likedBy is private — only user2 themselves can list what user2 has liked
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${otherToken}`)
        .query({ olderthan: Date.now(), likedBy: testData.users.user2._id.toString() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Liked By User2');
      expect(names).to.not.include('Not Liked By User2');
    });

    it('returns 400 for a malformed likedBy id', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), likedBy: 'not-an-id' });

      expect(response.status).to.equal(400);
    });

    it('returns 403 for an anonymous request', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), likedBy: testData.users.user2._id.toString() });

      expect(response.status).to.equal(403);
    });

    it("returns 403 when a logged-in user requests another user's liked blueprints", async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprintsSecure')
        .set('Authorization', `Bearer ${authToken}`) // user1
        .query({ olderthan: Date.now(), likedBy: testData.users.user2._id.toString() });

      expect(response.status).to.equal(403);
    });
  });
});
