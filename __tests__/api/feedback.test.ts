import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { FeedbackModel } from '../../app/api/models/feedback';

describe('Feedback API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // ─── POST /api/feedback ──────────────────────────────────────────────────────

  describe('POST /api/feedback', function () {
    it('should return 401 without a token', async function () {
      const response = await TestSetup.request()
        .post('/api/feedback')
        .send({ message: 'hello' });
      expect(response.status).to.equal(401);
    });

    it('should return 400 when message is empty', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: '   ' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when message is missing', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).to.equal(400);
    });

    it('should create feedback and return 201', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Great tool!',
          url: 'http://localhost:4200/',
          userAgent: 'TestAgent/1.0',
          consoleErrors: [],
        });
      expect(response.status).to.equal(201);
      expect(response.body.message).to.equal('Feedback received');

      const saved = await FeedbackModel.model.findOne({ message: 'Great tool!' });
      expect(saved).to.exist;
      expect(saved!.status).to.equal('open');
      expect(saved!.userEmail).to.equal(testData.users.user1.email);
    });

    it('should truncate message to 5000 characters', async function () {
      const token = testData.users.user1.generateJwt();
      const longMessage = 'x'.repeat(6000);
      const response = await TestSetup.request()
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: longMessage });
      expect(response.status).to.equal(201);

      const saved = await FeedbackModel.model.findOne({});
      expect(saved!.message.length).to.equal(5000);
    });

    it('should capture at most 10 console errors', async function () {
      const token = testData.users.user1.generateJwt();
      const errors = Array.from({ length: 15 }, (_, i) => `error ${i}`);
      const response = await TestSetup.request()
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'errors test', consoleErrors: errors });
      expect(response.status).to.equal(201);

      const saved = await FeedbackModel.model.findOne({});
      expect(saved!.consoleErrors.length).to.equal(10);
    });
  });

  // ─── GET /api/admin/feedback ─────────────────────────────────────────────────

  describe('GET /api/admin/feedback', function () {
    it('should return 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/admin/feedback');
      expect(response.status).to.equal(401);
    });

    it('should return 403 for a non-admin user', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/admin/feedback')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(403);
    });

    it('should return paginated feedback for an admin', async function () {
      const adminToken = testData.users.user1.generateJwt('admin');

      await FeedbackModel.model.create([
        { userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'msg1', status: 'open' },
        { userId: testData.users.user2._id, userEmail: 'b@test.com', username: 'b', message: 'msg2', status: 'resolved' },
      ]);

      const response = await TestSetup.request()
        .get('/api/admin/feedback')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.items).to.be.an('array').with.lengthOf(2);
      expect(response.body.total).to.equal(2);
      expect(response.body.page).to.equal(1);
    });

    it('should filter by status', async function () {
      const adminToken = testData.users.user1.generateJwt('admin');

      await FeedbackModel.model.create([
        { userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'open one', status: 'open' },
        { userId: testData.users.user2._id, userEmail: 'b@test.com', username: 'b', message: 'resolved one', status: 'resolved' },
      ]);

      const response = await TestSetup.request()
        .get('/api/admin/feedback')
        .query({ status: 'open' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.items).to.have.lengthOf(1);
      expect(response.body.items[0].message).to.equal('open one');
    });
  });

  // ─── PATCH /api/admin/feedback/:id ──────────────────────────────────────────

  describe('PATCH /api/admin/feedback/:id', function () {
    it('should return 403 for a non-admin user', async function () {
      const item = await FeedbackModel.model.create({
        userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'hi', status: 'open',
      });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch(`/api/admin/feedback/${item._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });
      expect(response.status).to.equal(403);
    });

    it('should return 400 for an invalid status', async function () {
      const item = await FeedbackModel.model.create({
        userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'hi', status: 'open',
      });
      const adminToken = testData.users.user1.generateJwt('admin');
      const response = await TestSetup.request()
        .patch(`/api/admin/feedback/${item._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'deleted' });
      expect(response.status).to.equal(400);
    });

    it('should return 404 for a non-existent id', async function () {
      const adminToken = testData.users.user1.generateJwt('admin');
      const response = await TestSetup.request()
        .patch('/api/admin/feedback/000000000000000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });
      expect(response.status).to.equal(404);
    });

    it('should update status and return the updated item', async function () {
      const item = await FeedbackModel.model.create({
        userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'fix this', status: 'open',
      });
      const adminToken = testData.users.user1.generateJwt('admin');

      const response = await TestSetup.request()
        .patch(`/api/admin/feedback/${item._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('resolved');
      expect(response.body._id).to.equal(String(item._id));
    });

    it('should update to spam status', async function () {
      const item = await FeedbackModel.model.create({
        userId: testData.users.user1._id, userEmail: 'a@test.com', username: 'a', message: 'buy now!!!', status: 'open',
      });
      const adminToken = testData.users.user1.generateJwt('admin');

      const response = await TestSetup.request()
        .patch(`/api/admin/feedback/${item._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'spam' });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('spam');
    });
  });
});
