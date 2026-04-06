import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('WorkOS Auth API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/auth/exchange', function () {
    it('should return 400 when no code is provided', async function () {
      const response = await TestSetup.request().get('/api/auth/exchange');
      expect(response.status).to.equal(400);
    });

    it('should return 400 for an invalid or expired code', async function () {
      const response = await TestSetup.request()
        .get('/api/auth/exchange')
        .query({ code: 'not-a-real-code' });
      expect(response.status).to.equal(400);
    });
  });

  describe('GET /api/auth/profile', function () {
    it('should return 401 without a JWT', async function () {
      const response = await TestSetup.request().get('/api/auth/profile');
      expect(response.status).to.equal(401);
    });

    it('should return the user profile for a valid JWT', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(200);
      expect(response.body.username).to.equal(testData.users.user1.username);
      expect(response.body.email).to.equal(testData.users.user1.email);
    });
  });

  describe('GET /api/auth/switch-account', function () {
    it('should return 401 without a JWT', async function () {
      const response = await TestSetup.request().get('/api/auth/switch-account');
      expect(response.status).to.equal(401);
    });

    it('should return 400 when the user has no active WorkOS session', async function () {
      // testData users are legacy users (no workosSessionId)
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/auth/switch-account')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(400);
    });
  });
});
