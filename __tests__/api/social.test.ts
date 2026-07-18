import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { FollowModel } from '../../app/api/models/follow';
import { Types } from 'mongoose';

describe('Profile, Follow, Feed API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // ─── GET /api/users/:username/profile(Secure) ───────────────────────────────

  describe('GET /api/users/:username/profile', function () {
    it('returns 404 for an unknown username', async function () {
      const response = await TestSetup.request().get('/api/users/no-such-user/profile');
      expect(response.status).to.equal(404);
    });

    it('returns anonymous profile payload with followedByMe false', async function () {
      const response = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );

      expect(response.status).to.equal(200);
      expect(response.body.username).to.equal(testData.users.user1.username);
      expect(response.body.bio).to.equal('');
      expect(response.body.blueprintCount).to.equal(1); // popularBlueprint
      expect(response.body.followerCount).to.equal(0);
      expect(response.body.followingCount).to.equal(0);
      expect(response.body.followedByMe).to.equal(false);
      expect(response.body.memberSince).to.exist;
    });

    it('excludes soft-deleted blueprints from blueprintCount', async function () {
      await BlueprintModel.model.updateOne(
        { _id: testData.blueprints.popularBlueprint._id },
        { deletedAt: new Date() }
      );

      const response = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );
      expect(response.body.blueprintCount).to.equal(0);
    });
  });

  describe('GET /api/users/:username/profileSecure', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profileSecure`
      );
      expect(response.status).to.equal(401);
    });

    it('reflects followedByMe true for the follower, false for others', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });

      const token2 = testData.users.user2.generateJwt();
      const response2 = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/profileSecure`)
        .set('Authorization', `Bearer ${token2}`);
      expect(response2.status).to.equal(200);
      expect(response2.body.followedByMe).to.equal(true);
      expect(response2.body.followerCount).to.equal(1);

      const token3 = testData.users.user3.generateJwt();
      const response3 = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/profileSecure`)
        .set('Authorization', `Bearer ${token3}`);
      expect(response3.body.followedByMe).to.equal(false);
    });
  });

  // ─── POST /api/follow ────────────────────────────────────────────────────────

  describe('POST /api/follow', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request()
        .post('/api/follow')
        .send({ followeeId: testData.users.user1._id.toString(), follow: true });
      expect(response.status).to.equal(401);
    });

    it('returns 400 on self-follow', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId: testData.users.user1._id.toString(), follow: true });
      expect(response.status).to.equal(400);
    });

    it('returns 404 for an unknown followeeId', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId: new Types.ObjectId().toString(), follow: true });
      expect(response.status).to.equal(404);
    });

    it('returns 400 for a missing or malformed followeeId', async function () {
      const token = testData.users.user1.generateJwt();

      const missing = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ follow: true });
      expect(missing.status).to.equal(400);

      const malformed = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId: 'not-an-id', follow: true });
      expect(malformed.status).to.equal(400);
    });

    it('follows, is idempotent, then unfollows idempotently', async function () {
      const token = testData.users.user1.generateJwt();
      const followeeId = testData.users.user2._id.toString();

      const follow1 = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: true });
      expect(follow1.status).to.equal(200);

      const follow2 = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: true });
      expect(follow2.status).to.equal(200);

      expect(
        await FollowModel.model.countDocuments({
          followerId: testData.users.user1._id,
          followeeId: testData.users.user2._id,
        })
      ).to.equal(1);

      const unfollow1 = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: false });
      expect(unfollow1.status).to.equal(200);

      const unfollow2 = await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: false });
      expect(unfollow2.status).to.equal(200);

      expect(
        await FollowModel.model.countDocuments({
          followerId: testData.users.user1._id,
          followeeId: testData.users.user2._id,
        })
      ).to.equal(0);
    });
  });

  // ─── GET /api/users/:username/followers, /following ──────────────────────────

  describe('GET /api/users/:username/followers', function () {
    it('returns 404 for an unknown username', async function () {
      const response = await TestSetup.request()
        .get('/api/users/no-such-user/followers')
        .query({ olderthan: Date.now() });
      expect(response.status).to.equal(404);
    });

    it('returns an empty list when nobody follows the user', async function () {
      const response = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/followers`)
        .query({ olderthan: Date.now() });
      expect(response.status).to.equal(200);
      expect(response.body.users).to.deep.equal([]);
      expect(response.body.remaining).to.equal(0);
    });

    it('lists followers newest first, with followedByMe reflecting the viewer', async function () {
      // user2 and user3 both follow user1; the viewer (user2) also follows user3 back
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      await FollowModel.model.create({
        followerId: testData.users.user3._id,
        followeeId: testData.users.user1._id,
        createdAt: new Date(),
      });
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user3._id,
      });

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/followers`)
        // Small future buffer so this can't race the createdAt: new Date() follow just above
        .query({ olderthan: Date.now() + 1000 })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      const usernames = response.body.users.map((u: any) => u.username);
      expect(usernames).to.deep.equal([
        testData.users.user3.username,
        testData.users.user2.username,
      ]);

      const user3Row = response.body.users.find((u: any) => u.username === testData.users.user3.username);
      expect(user3Row.followedByMe).to.equal(true); // viewer (user2) follows user3 back

      const user2Row = response.body.users.find((u: any) => u.username === testData.users.user2.username);
      expect(user2Row.followedByMe).to.equal(false); // viewer does not follow themselves
    });

    it('returns followedByMe false for an anonymous viewer', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });

      const response = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/followers`)
        // Small future buffer so this can't race the Follow's default createdAt: Date.now()
        .query({ olderthan: Date.now() + 1000 });

      expect(response.status).to.equal(200);
      expect(response.body.users[0].followedByMe).to.equal(false);
    });
  });

  describe('GET /api/users/:username/following', function () {
    it('returns 404 for an unknown username', async function () {
      const response = await TestSetup.request()
        .get('/api/users/no-such-user/following')
        .query({ olderthan: Date.now() });
      expect(response.status).to.equal(404);
    });

    it('lists who the user follows', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user1._id,
        followeeId: testData.users.user2._id,
      });

      const response = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/following`)
        // Small future buffer so this can't race the Follow's default createdAt: Date.now()
        .query({ olderthan: Date.now() + 1000 });

      expect(response.status).to.equal(200);
      const usernames = response.body.users.map((u: any) => u.username);
      expect(usernames).to.deep.equal([testData.users.user2.username]);
    });
  });

  // ─── PATCH /api/users/me ─────────────────────────────────────────────────────

  describe('PATCH /api/users/me', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().patch('/api/users/me').send({ bio: 'hi' });
      expect(response.status).to.equal(401);
    });

    it('sets bio and it persists into the profile', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'I build coal generators.' });

      expect(response.status).to.equal(200);
      expect(response.body.bio).to.equal('I build coal generators.');

      const profile = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );
      expect(profile.body.bio).to.equal('I build coal generators.');
    });

    it('rejects a bio over 500 characters', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'x'.repeat(501) });
      expect(response.status).to.equal(400);
    });

    it('accepts exactly 500 characters', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'x'.repeat(500) });
      expect(response.status).to.equal(200);
    });
  });

  // ─── GET /api/feed ────────────────────────────────────────────────────────────

  describe('GET /api/feed', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/feed').query({ olderthan: Date.now() });
      expect(response.status).to.equal(401);
    });

    it('returns an empty feed when following no one', async function () {
      const token = testData.users.user3.generateJwt();
      const response = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.blueprints).to.deep.equal([]);
      expect(response.body.remaining).to.equal(0);
    });

    it('returns only followees blueprints, newest first', async function () {
      // user2 follows user1 (owner of popularBlueprint) but not user3 (owner of oldBlueprint/copiedBlueprint)
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((b: any) => b.name);
      expect(names).to.deep.equal(['Super Coal Generator Setup']);
    });

    it('excludes followees\' drafts — following someone must not reveal unpublished work', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });
      await BlueprintModel.model.updateOne(
        { _id: testData.blueprints.popularBlueprint._id },
        { isPublished: false }
      );

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.blueprints).to.deep.equal([]);
    });

    it('excludes soft-deleted blueprints', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });
      await BlueprintModel.model.updateOne(
        { _id: testData.blueprints.popularBlueprint._id },
        { deletedAt: new Date() }
      );

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.blueprints).to.deep.equal([]);
    });

    it('paginates with the olderthan cursor', async function () {
      await FollowModel.model.create({
        followerId: testData.users.user2._id,
        followeeId: testData.users.user1._id,
      });

      // Seed enough additional blueprints from the followed user to exceed BROWSE_INCREMENT (10 in test env)
      const now = Date.now();
      const extra = Array.from({ length: 12 }, (_, i) => ({
        owner: testData.users.user1._id,
        name: `Feed Item ${i}`,
        ratingCount: 0,
        ratingAverage: 0,
        createdAt: new Date(now - (i + 1) * 60 * 1000),
        modifiedAt: new Date(now - (i + 1) * 60 * 1000),
        thumbnail: 'x',
        data: { version: '1.0', buildings: [], info: { name: `Feed Item ${i}` } },
        deletedAt: null,
      }));
      await BlueprintModel.model.insertMany(extra);

      const token = testData.users.user2.generateJwt();
      const firstPage = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: now + 1000 })
        .set('Authorization', `Bearer ${token}`);

      expect(firstPage.status).to.equal(200);
      expect(firstPage.body.blueprints).to.have.lengthOf(10);
      expect(firstPage.body.remaining).to.be.greaterThan(0);

      const secondPage = await TestSetup.request()
        .get('/api/feed')
        .query({ olderthan: new Date(firstPage.body.oldest).getTime() })
        .set('Authorization', `Bearer ${token}`);

      expect(secondPage.status).to.equal(200);
      const firstIds = firstPage.body.blueprints.map((b: any) => b.id);
      const secondIds = secondPage.body.blueprints.map((b: any) => b.id);
      expect(secondIds.some((id: string) => firstIds.includes(id))).to.equal(false);
    });
  });
});
