import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup, TestDbHelper } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const SAMPLE_BLUEPRINT_DATA = {
  version: '1.0',
  buildings: [{ id: 'Generator', x: 0, y: 0, element: 'Coal' }],
  info: { name: 'Test', description: 'Test blueprint' },
};

describe('Blueprint API (Mocha)', function () {
  let testData: any;

  // Global setup
  before(async function () {
    this.timeout(10000);
    // Give the app time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async function () {
    // Local cleanup - don't close database connection as other tests might still need it
  });

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/getblueprints', function () {
    it('should return blueprints ordered by creation date with pagination', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      expect(response.body).to.exist;
      expect(response.body).to.be.an('object');

      if (response.body.blueprints) {
        expect(response.body.blueprints).to.be.an('array');

        const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);
        expect(blueprintNames).to.include('Super Coal Generator Setup');
        expect(blueprintNames).to.include('Oxygen Production Line');
      }
    });

    it('should filter blueprints by date - only return older blueprints', async function () {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: twoDaysAgo });

      expect(response.status).to.equal(200);

      if (response.body.blueprints) {
        const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);

        expect(blueprintNames).to.include('Super Coal Generator Setup'); // 3 days old
        expect(blueprintNames).to.include('Legacy Food System'); // 30 days old
        expect(blueprintNames).to.not.include('Oxygen Production Line'); // 1 day old
      }
    });

    it('should return correct like counts for popular blueprints', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);

      const popularBlueprint = response.body.blueprints.find(
        (bp: any) => bp.name === 'Super Coal Generator Setup'
      );
      expect(popularBlueprint).to.exist;
      expect(popularBlueprint.nbLikes).to.equal(2);
    });

    it('includes forks/copies — the silent isCopy hide was removed (issue #8: forks are now an explicit, visible relationship via forkCount/forkedFrom)', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);

      const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);
      expect(blueprintNames).to.include('Modified Coal Generator'); // Copy is now visible
      expect(blueprintNames).to.include('Super Coal Generator Setup'); // Original should still be included
    });

    it('should return 400 error with proper validation for missing olderthan parameter', async function () {
      const response = await TestSetup.request().get('/api/getblueprints');

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });

    it('should return 400 error for invalid olderthan parameter formats', async function () {
      // Test non-numeric string
      const response1 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: 'invalid-date' });

      expect(response1.status).to.equal(400);
      expect(response1.body.errors).to.be.an('array');

      // Test empty parameter
      const response2 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: '' });

      expect(response2.status).to.equal(400);
      expect(response2.body.errors).to.be.an('array');

      // Test mixed alphanumeric
      const response3 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: 'abc123def' });

      expect(response3.status).to.equal(400);
      expect(response3.body.errors).to.be.an('array');
    });

    it('should accept negative timestamps as valid dates before 1970', async function () {
      // Negative timestamps represent dates before Jan 1, 1970
      const response = await TestSetup.request().get('/api/getblueprints').query({ olderthan: -1 });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('blueprints');
    });

    it('should filter blueprints by owner with filterUserId', async function () {
      const user1Id = testData.users.user1._id.toString();

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterUserId: user1Id });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Super Coal Generator Setup');
      expect(names).to.not.include('Oxygen Production Line');
      expect(names).to.not.include('Legacy Food System');
    });

    it('should filter blueprints by name with filterName', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'oxygen' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Oxygen Production Line');
      expect(names).to.not.include('Super Coal Generator Setup');
    });

    it('should do case-insensitive name filtering', async function () {
      const lower = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'legacy' });
      const upper = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'LEGACY' });

      expect(lower.status).to.equal(200);
      expect(upper.status).to.equal(200);
      expect(lower.body.blueprints.map((bp: any) => bp.name)).to.include('Legacy Food System');
      expect(upper.body.blueprints.map((bp: any) => bp.name)).to.include('Legacy Food System');
    });
  });

  describe('GET /api/getblueprints?sort=popular', function () {
    it('should return blueprints in descending likeCount order', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      // Seeded: Super Coal (2 likes), Oxygen (1), then 0-like ties broken by
      // createdAt desc: Modified Coal Generator (2 days ago) before Legacy (30 days ago)
      expect(names.slice(0, 4)).to.deep.equal([
        'Super Coal Generator Setup',
        'Oxygen Production Line',
        'Modified Coal Generator',
        'Legacy Food System',
      ]);
      const likes = response.body.blueprints.map((bp: any) => bp.nbLikes);
      expect(likes).to.deep.equal([...likes].sort((a, b) => b - a));
    });

    it('should break likeCount ties by createdAt descending', async function () {
      // Second 0-like blueprint, newer than Legacy Food System (30 days old)
      await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Fresh Zero Likes',
        likes: [],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names.indexOf('Fresh Zero Likes')).to.be.lessThan(
        names.indexOf('Legacy Food System')
      );
    });

    it('should paginate with skip', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular', skip: 1 });

      expect(response.status).to.equal(200);
      expect(response.body.blueprints[0].name).to.equal('Oxygen Production Line');
    });

    it('should accept sort=recent explicitly', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'recent' });

      expect(response.status).to.equal(200);
      expect(response.body.blueprints[0].name).to.equal('Oxygen Production Line'); // newest
    });

    it('should return 400 for an unknown sort value', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'bogus' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('should return 400 for negative or non-numeric skip', async function () {
      const negative = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular', skip: -1 });
      expect(negative.status).to.equal(400);
      expect(negative.body.errors).to.be.an('array');

      const nonNumeric = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular', skip: 'abc' });
      expect(nonNumeric.status).to.equal(400);
      expect(nonNumeric.body.errors).to.be.an('array');
    });

    it('should return 400 for skip above the maximum offset', async function () {
      const tooLarge = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular', skip: 10001 });
      expect(tooLarge.status).to.equal(400);
      expect(tooLarge.body.errors).to.be.an('array');
    });

    it('should combine popular sort with facet filters', async function () {
      await BlueprintModel.model.create({
        owner: testData.users.user1._id,
        name: 'Popular Power',
        likes: ['a', 'b', 'c'],
        likeCount: 3,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        modifiedAt: new Date(),
        thumbnail: TINY_PNG,
        data: SAMPLE_BLUEPRINT_DATA,
        deletedAt: null,
        gameVersion: 'base',
        category: 'power',
      });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular', gameVersion: 'base' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Popular Power');
      expect(names).to.not.include('Super Coal Generator Setup'); // no gameVersion
    });
  });

  describe('GET /api/getblueprint/:id', function () {
    it('should return blueprint data for a valid id', async function () {
      const id = testData.blueprints.popularBlueprint._id.toString();

      const response = await TestSetup.request().get(`/api/getblueprint/${id}`);

      expect(response.status).to.equal(200);
      expect(response.body.id).to.equal(id);
      expect(response.body.name).to.equal('Super Coal Generator Setup');
      expect(response.body.data).to.exist;
      expect(response.body.nbLikes).to.equal(2);
    });

    it('should set likedByMe when userId matches a like', async function () {
      const id = testData.blueprints.popularBlueprint._id.toString();
      const userId = testData.users.user2._id.toString(); // user2 liked the popular blueprint

      const response = await TestSetup.request()
        .get(`/api/getblueprint/${id}`)
        .query({ userId });

      expect(response.status).to.equal(200);
      expect(response.body.likedByMe).to.be.true;
    });

    it('should return likedByMe=false when userId is not a liker', async function () {
      const id = testData.blueprints.popularBlueprint._id.toString();
      const userId = testData.users.user1._id.toString(); // user1 owns it but didn't like it

      const response = await TestSetup.request()
        .get(`/api/getblueprint/${id}`)
        .query({ userId });

      expect(response.status).to.equal(200);
      expect(response.body.likedByMe).to.be.false;
    });

    it('should return 404 for a nonexistent id', async function () {
      const fakeId = '000000000000000000000001';

      const response = await TestSetup.request().get(`/api/getblueprint/${fakeId}`);

      expect(response.status).to.equal(404);
      expect(response.body.errors).to.be.an('array');
    });

    it('should return 500 for an invalid id format', async function () {
      const response = await TestSetup.request().get('/api/getblueprint/not-an-id');

      expect(response.status).to.equal(500);
      expect(response.body.errors).to.be.an('array');
    });
  });

  describe('POST /api/uploadblueprint', function () {
    it('should return 401 without authentication', async function () {
      const response = await TestSetup.request().post('/api/uploadblueprint').send({
        name: 'My Blueprint',
        blueprint: SAMPLE_BLUEPRINT_DATA,
        thumbnail: TINY_PNG,
      });

      expect(response.status).to.equal(401);
    });

    it('should save a new blueprint and return its id', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Blueprint', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      expect(response.status).to.equal(200);
      expect(response.body.id).to.be.a('string').and.have.length.greaterThan(0);
    });

    it('should return overwrite prompt when blueprint name already exists', async function () {
      const token = testData.users.user1.generateJwt();

      // Upload once
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Duplicate Name', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      // Upload again without overwrite flag
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Duplicate Name', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      expect(response.status).to.equal(200);
      expect(response.body.overwrite).to.be.true;
    });

    it('should overwrite an existing blueprint when overwrite=true', async function () {
      const token = testData.users.user1.generateJwt();

      const first = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overwrite Me', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      const second = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Overwrite Me',
          blueprint: { ...SAMPLE_BLUEPRINT_DATA, version: '2.0' },
          thumbnail: TINY_PNG,
          overwrite: true,
        });

      expect(second.status).to.equal(200);
      expect(second.body.id).to.equal(first.body.id); // same record, same id
    });

    it('should reject a name with special characters', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad! <Name>', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });

    it('should reject a name longer than 60 characters', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'a'.repeat(61),
          blueprint: SAMPLE_BLUEPRINT_DATA,
          thumbnail: TINY_PNG,
        });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });

    it('should self-like a new upload with a consistent likeCount', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Self Like', blueprint: SAMPLE_BLUEPRINT_DATA, thumbnail: TINY_PNG });

      expect(response.status).to.equal(200);

      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.likes).to.deep.equal([testData.users.user1._id.toString()]);
      expect(saved!.likeCount).to.equal(1);
    });

    it('should correct out-of-bounds building positions after upload', async function () {
      const token = testData.users.user1.generateJwt();

      const blueprintWithOffsets = {
        blueprintItems: [
          { id: 'Generator', position: { x: 10000, y: 0 } },   // x > 8000 → 10000 - 9999 = 1
          { id: 'Battery',   position: { x: 0,     y: -9000 } }, // y < -8000 → -9000 + 9999 = 999
          { id: 'Wire',      position: { x: 100,   y: -100 } },  // in bounds, unchanged
        ],
      };

      const upload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Position Correction Test', blueprint: blueprintWithOffsets, thumbnail: TINY_PNG });

      expect(upload.status).to.equal(200);
      const id = upload.body.id;

      // Allow the async UpdatePositionCorrection save to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      const saved = await BlueprintModel.model.findById(id);
      const items = (saved!.data as any).blueprintItems;

      expect(items[0].position.x).to.equal(1);
      expect(items[1].position.y).to.equal(999);
      expect(items[2].position.x).to.equal(100);
      expect(items[2].position.y).to.equal(-100);
    });
  });

  describe('POST /api/likeblueprint', function () {
    it('should return 401 without authentication', async function () {
      const id = testData.blueprints.recentBlueprint._id.toString();

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .send({ blueprintId: id, like: true });

      expect(response.status).to.equal(401);
    });

    it('should like a blueprint', async function () {
      const token = testData.users.user3.generateJwt();
      const id = testData.blueprints.recentBlueprint._id.toString();

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id, like: true });

      expect(response.status).to.equal(200);
      expect(response.body.likeBlueprint).to.equal('OK');

      const updated = await BlueprintModel.model.findById(id);
      expect(updated!.likes).to.include(testData.users.user3._id.toString());
      expect(updated!.likeCount).to.equal(2); // seeded with 1 like from user1
    });

    it('should keep likeCount stable when liking twice (idempotent)', async function () {
      const token = testData.users.user3.generateJwt();
      const id = testData.blueprints.recentBlueprint._id.toString();

      for (let i = 0; i < 2; i++) {
        const response = await TestSetup.request()
          .post('/api/likeblueprint')
          .set('Authorization', `Bearer ${token}`)
          .send({ blueprintId: id, like: true });
        expect(response.status).to.equal(200);
        expect(response.body.likeBlueprint).to.equal('OK');
      }

      const updated = await BlueprintModel.model.findById(id);
      expect(updated!.likeCount).to.equal(2);
      expect(
        updated!.likes.filter(l => l === testData.users.user3._id.toString())
      ).to.have.length(1);
    });

    it('should unlike a blueprint', async function () {
      const token = testData.users.user2.generateJwt();
      const id = testData.blueprints.popularBlueprint._id.toString();
      // user2 already likes the popular blueprint (seeded)

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id, like: false });

      expect(response.status).to.equal(200);
      expect(response.body.likeBlueprint).to.equal('OK');

      const updated = await BlueprintModel.model.findById(id);
      expect(updated!.likes).to.not.include(testData.users.user2._id.toString());
      expect(updated!.likeCount).to.equal(1); // seeded with 2 likes
    });

    it('should keep likeCount stable when unliking a blueprint not liked', async function () {
      const token = testData.users.user1.generateJwt(); // user1 never liked recentBlueprint
      const id = testData.blueprints.oldBlueprint._id.toString(); // 0 likes seeded

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id, like: false });

      expect(response.status).to.equal(200);
      expect(response.body.likeBlueprint).to.equal('OK');

      const updated = await BlueprintModel.model.findById(id);
      expect(updated!.likeCount).to.equal(0);
      expect(updated!.likes).to.deep.equal([]);
    });

    it('should return 404 for a nonexistent blueprint id', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: '000000000000000000000001', like: true });

      expect(response.status).to.equal(404);
      expect(response.body.errors).to.be.an('array');
    });

    it('should return 400 when blueprintId is missing', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ like: true });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });
  });

  describe('POST /api/deleteblueprint', function () {
    it('should return 401 without authentication', async function () {
      const id = testData.blueprints.popularBlueprint._id.toString();

      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .send({ blueprintId: id });

      expect(response.status).to.equal(401);
    });

    it('should soft-delete an owned blueprint', async function () {
      const token = testData.users.user1.generateJwt();
      const id = testData.blueprints.popularBlueprint._id.toString();

      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id });

      expect(response.status).to.equal(200);
      expect(response.body.deleteBlueprint).to.equal('OK');

      const updated = await BlueprintModel.model.findById(id);
      expect(updated!.deletedAt).to.be.instanceOf(Date);
    });

    it('should not allow deleting another user\'s blueprint', async function () {
      const token = testData.users.user2.generateJwt(); // user2 does not own popularBlueprint
      const id = testData.blueprints.popularBlueprint._id.toString();

      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id });

      expect(response.status).to.equal(403);
      expect(response.body.errors).to.be.an('array');

      const unchanged = await BlueprintModel.model.findById(id);
      expect(unchanged!.deletedAt ?? null).to.be.null;
    });

    it('should return 400 when blueprintId is missing', async function () {
      const token = testData.users.user1.generateJwt();

      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('should exclude deleted blueprints from getblueprints listing', async function () {
      const token = testData.users.user1.generateJwt();
      const id = testData.blueprints.popularBlueprint._id.toString();

      const before = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });
      expect(before.status).to.equal(200);
      expect(before.body.blueprints.map((bp: any) => bp.name)).to.include('Super Coal Generator Setup');

      await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: id });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Super Coal Generator Setup');
    });
  });
});
