import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { CommentModel } from '../../app/api/models/comment';
import { Types } from 'mongoose';

describe('Blueprint details API', function () {
  let testData: any;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    blueprintId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/blueprints/:id', function () {
    it('returns 400 for a malformed id and 404 for unknown or deleted blueprints', async function () {
      expect((await TestSetup.request().get('/api/blueprints/not-an-id')).status).to.equal(400);
      expect(
        (await TestSetup.request().get(`/api/blueprints/${new Types.ObjectId()}`)).status
      ).to.equal(404);

      await BlueprintModel.model.updateOne({ _id: blueprintId }, { deletedAt: new Date() });
      expect((await TestSetup.request().get(`/api/blueprints/${blueprintId}`)).status).to.equal(404);
    });

    it('returns meta without the heavy data payload for anonymous viewers', async function () {
      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}`);

      expect(response.status).to.equal(200);
      expect(response.body.id).to.equal(blueprintId);
      expect(response.body.name).to.equal('Super Coal Generator Setup');
      expect(response.body.ownerName).to.equal(testData.users.user1.username);
      expect(response.body.ownerId).to.equal(testData.users.user1._id.toString());
      expect(response.body.tags).to.deep.equal(['power', 'coal', 'automation']);
      expect(response.body.nbLikes).to.equal(2);
      expect(response.body.likedByMe).to.equal(false);
      expect(response.body.ownedByMe).to.equal(false);
      expect(response.body.commentCount).to.equal(0);
      expect(response.body.createdAt).to.exist;
      expect(response.body.thumbnail).to.exist;
      expect(response.body.data).to.equal(undefined);
    });

    it('personalizes likedByMe and ownedByMe when a token is sent', async function () {
      // user2 liked popularBlueprint in the seed; user1 owns it
      const liker = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user2.generateJwt()}`);
      expect(liker.body.likedByMe).to.equal(true);
      expect(liker.body.ownedByMe).to.equal(false);

      const owner = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}`)
        .set('Authorization', `Bearer ${testData.users.user1.generateJwt()}`);
      expect(owner.body.likedByMe).to.equal(false);
      expect(owner.body.ownedByMe).to.equal(true);
    });

    it('counts only visible comments', async function () {
      const [, kept] = await CommentModel.model.create([
        {
          blueprintId,
          authorId: testData.users.user2._id,
          body: 'first',
        },
        {
          blueprintId,
          authorId: testData.users.user3._id,
          body: 'second',
        },
        {
          blueprintId,
          authorId: testData.users.user2._id,
          body: 'deleted',
          deletedAt: new Date(),
        },
      ]);
      expect(kept).to.exist;

      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}`);
      expect(response.body.commentCount).to.equal(2);
    });
  });

  describe('commentCount on list responses', function () {
    it('includes per-blueprint visible comment counts in /api/getblueprints', async function () {
      await CommentModel.model.create([
        { blueprintId, authorId: testData.users.user2._id, body: 'works great' },
        { blueprintId, authorId: testData.users.user3._id, body: 'confirmed' },
        {
          blueprintId,
          authorId: testData.users.user3._id,
          body: 'removed',
          deletedAt: new Date(),
        },
      ]);

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      const byName = new Map(
        response.body.blueprints.map((b: any) => [b.name, b.commentCount])
      );
      expect(byName.get('Super Coal Generator Setup')).to.equal(2);
      expect(byName.get('Oxygen Production Line')).to.equal(0);
    });
  });
});
