import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { NotificationModel } from '../../app/api/models/notification';

describe('Notifications API', function () {
  let testData: any;
  let popularId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    popularId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // ─── Triggers ─────────────────────────────────────────────────────────────

  describe('comment/reply triggers', function () {
    it('notifies the blueprint owner on a top-level comment', async function () {
      const token = testData.users.user2.generateJwt(); // popularBlueprint is owned by user1
      await TestSetup.request()
        .post(`/api/blueprints/${popularId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'nice build' });

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user1._id });
      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].type).to.equal('comment');
      expect(notifications[0].actorId.toString()).to.equal(testData.users.user2._id.toString());
      expect(notifications[0].blueprintId!.toString()).to.equal(popularId);
    });

    it('does not notify the owner when they comment on their own blueprint', async function () {
      const token = testData.users.user1.generateJwt(); // owner of popularBlueprint
      await TestSetup.request()
        .post(`/api/blueprints/${popularId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'note to self' });

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user1._id });
      expect(notifications).to.have.lengthOf(0);
    });

    it('notifies the parent comment author (not just the blueprint owner) on a reply', async function () {
      const user2Token = testData.users.user2.generateJwt();
      const topLevel = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/comments`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ body: 'top level comment' });
      const parentId = topLevel.body.comment.id;

      // user1 (blueprint owner) already got a 'comment' notification for the top-level; clear it
      // so we can isolate the reply notification.
      await NotificationModel.model.deleteMany({});

      const user3Token = testData.users.user3.generateJwt();
      await TestSetup.request()
        .post(`/api/blueprints/${popularId}/comments`)
        .set('Authorization', `Bearer ${user3Token}`)
        .send({ body: 'a reply', parentId });

      const notifications = await NotificationModel.model.find({});
      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].type).to.equal('reply');
      expect(notifications[0].recipientId.toString()).to.equal(testData.users.user2._id.toString());
      expect(notifications[0].actorId.toString()).to.equal(testData.users.user3._id.toString());
    });
  });

  describe('like trigger', function () {
    it('notifies the blueprint owner when someone else likes it', async function () {
      // recentBlueprint is owned by user2 and not yet liked by user3 (popularBlueprint
      // is pre-liked by both user2 and user3 in the seed, which would make a re-like a no-op)
      const recentId = testData.blueprints.recentBlueprint._id.toString();
      const token = testData.users.user3.generateJwt();
      await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: recentId, like: true });

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user2._id });
      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].type).to.equal('like');
      expect(notifications[0].actorId.toString()).to.equal(testData.users.user3._id.toString());
    });

    it('does not notify on unlike', async function () {
      // user2 and user3 already like popularBlueprint (seeded)
      const token = testData.users.user2.generateJwt();
      await TestSetup.request()
        .post('/api/likeblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: popularId, like: false });

      const notifications = await NotificationModel.model.find({});
      expect(notifications).to.have.lengthOf(0);
    });
  });

  describe('fork trigger', function () {
    it('notifies the source blueprint owner, pointing at the new fork', async function () {
      const token = testData.users.user2.generateJwt();
      const fork = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/fork`)
        .set('Authorization', `Bearer ${token}`);

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user1._id });
      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].type).to.equal('fork');
      expect(notifications[0].blueprintId!.toString()).to.equal(fork.body.id);
    });
  });

  describe('follow trigger', function () {
    it('notifies the followee on a new follow', async function () {
      const token = testData.users.user2.generateJwt();
      await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId: testData.users.user1._id.toString(), follow: true });

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user1._id });
      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].type).to.equal('follow');
    });

    it('does not create a duplicate notification for an idempotent repeat follow', async function () {
      const token = testData.users.user2.generateJwt();
      const body = { followeeId: testData.users.user1._id.toString(), follow: true };
      await TestSetup.request().post('/api/follow').set('Authorization', `Bearer ${token}`).send(body);
      await TestSetup.request().post('/api/follow').set('Authorization', `Bearer ${token}`).send(body);

      const notifications = await NotificationModel.model.find({ recipientId: testData.users.user1._id });
      expect(notifications).to.have.lengthOf(1);
    });

    it('does not notify on unfollow', async function () {
      const token = testData.users.user2.generateJwt();
      const followeeId = testData.users.user1._id.toString();
      await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: true });
      await NotificationModel.model.deleteMany({});

      await TestSetup.request()
        .post('/api/follow')
        .set('Authorization', `Bearer ${token}`)
        .send({ followeeId, follow: false });

      const notifications = await NotificationModel.model.find({});
      expect(notifications).to.have.lengthOf(0);
    });
  });

  // ─── GET /api/notifications ───────────────────────────────────────────────

  describe('GET /api/notifications', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/notifications').query({ olderthan: Date.now() });
      expect(response.status).to.equal(401);
    });

    it('lists notifications newest first with actor username and unreadCount', async function () {
      await NotificationModel.model.create({
        recipientId: testData.users.user1._id,
        actorId: testData.users.user2._id,
        type: 'like',
        blueprintId: popularId,
        createdAt: new Date(Date.now() - 60 * 1000),
      });
      await NotificationModel.model.create({
        recipientId: testData.users.user1._id,
        actorId: testData.users.user3._id,
        type: 'follow',
        createdAt: new Date(),
      });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/notifications')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.unreadCount).to.equal(2);
      expect(response.body.notifications).to.have.lengthOf(2);
      expect(response.body.notifications[0].type).to.equal('follow');
      expect(response.body.notifications[0].actorUsername).to.equal(testData.users.user3.username);
      expect(response.body.notifications[1].type).to.equal('like');
      expect(response.body.notifications[1].blueprintName).to.equal('Super Coal Generator Setup');
    });

    it("only returns the requesting user's own notifications", async function () {
      await NotificationModel.model.create({
        recipientId: testData.users.user2._id,
        actorId: testData.users.user1._id,
        type: 'follow',
      });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/notifications')
        .query({ olderthan: Date.now() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.notifications).to.have.lengthOf(0);
      expect(response.body.unreadCount).to.equal(0);
    });
  });

  // ─── POST /api/notifications/mark-read ───────────────────────────────────

  describe('POST /api/notifications/mark-read', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().post('/api/notifications/mark-read');
      expect(response.status).to.equal(401);
    });

    it('marks all of the caller\'s unread notifications as read', async function () {
      await NotificationModel.model.create({
        recipientId: testData.users.user1._id,
        actorId: testData.users.user2._id,
        type: 'follow',
      });
      await NotificationModel.model.create({
        recipientId: testData.users.user1._id,
        actorId: testData.users.user3._id,
        type: 'follow',
      });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/notifications/mark-read')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(200);

      const stillUnread = await NotificationModel.model.countDocuments({
        recipientId: testData.users.user1._id,
        read: false,
      });
      expect(stillUnread).to.equal(0);
    });

    it("does not mark another user's notifications as read", async function () {
      await NotificationModel.model.create({
        recipientId: testData.users.user2._id,
        actorId: testData.users.user1._id,
        type: 'follow',
      });

      const token = testData.users.user1.generateJwt();
      await TestSetup.request().post('/api/notifications/mark-read').set('Authorization', `Bearer ${token}`);

      const stillUnread = await NotificationModel.model.countDocuments({
        recipientId: testData.users.user2._id,
        read: false,
      });
      expect(stillUnread).to.equal(1);
    });
  });
});
