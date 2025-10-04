import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('User Management API (Mocha)', function () {
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

  describe('GET /api/checkusername', function () {
    it('should correctly identify existing usernames', async function () {
      // Use the seeded test data
      const username = testData.users.user1.username;

      const response = await TestSetup.request().get('/api/checkusername').query({ username });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('usernameExists');
      expect(response.body.usernameExists).to.be.true;
    });

    it('should correctly identify available usernames', async function () {
      const response = await TestSetup.request()
        .get('/api/checkusername')
        .query({ username: 'nonexistentuser123' });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('usernameExists');
      expect(response.body.usernameExists).to.be.false;
    });

    it('should handle missing username parameter', async function () {
      const response = await TestSetup.request().get('/api/checkusername');

      // Should handle missing parameter gracefully
      expect([400, 200]).to.include(response.status);
    });
  });
});
