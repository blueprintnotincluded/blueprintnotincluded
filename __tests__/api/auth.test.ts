import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';
process.env.ENV_NAME = 'development'; // Bypass reCAPTCHA in tests

import { TestSetup } from '../setup/testSetup';

describe('Authentication API (Mocha)', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('POST /api/register', function () {
    it('should successfully create a new user', async function () {
      const newUser = {
        username: 'newuser123',
        email: 'newuser@test.com',
        password: 'testpassword123',
      };

      const response = await TestSetup.request().post('/api/register').send(newUser);

      expect(response.status).to.equal(200);
      expect(response.body.token).to.exist;
    });
  });

  describe('POST /api/login', function () {
    it('should successfully login with valid credentials', async function () {
      this.timeout(15000); // Increase timeout for this test
      // First create a user with a known password (matching Jest test exactly)
      const testPassword = 'testpassword123';
      const registerResponse = await TestSetup.request().post('/api/register').send({
        username: 'loginuser',
        email: 'loginuser@test.com',
        password: testPassword,
      });

      expect(registerResponse.status).to.equal(200);

      // Now test login with the same credentials
      const loginResponse = await TestSetup.request().post('/api/login').send({
        username: 'loginuser',
        password: testPassword,
      });

      expect(loginResponse.status).to.equal(200);
      expect(loginResponse.body.token).to.exist;
    });

    it('should reject login with invalid credentials', async function () {
      const response = await TestSetup.request().post('/api/login').send({
        username: testData.users.user1.username, // Valid username from test data
        password: 'wrongpassword', // But wrong password
      });

      expect(response.status).to.equal(401);
    });

    it('should reject login with nonexistent user', async function () {
      const response = await TestSetup.request().post('/api/login').send({
        username: 'nonexistentuser',
        password: 'anypassword',
      });

      expect(response.status).to.equal(401);
    });

    it('should handle missing username parameter', async function () {
      const response = await TestSetup.request().post('/api/login').send({
        password: 'somepassword',
      });

      expect(response.status).to.equal(401); // Matches Jest behavior - returns 401 not 400
    });

    it('should handle missing password parameter', async function () {
      const response = await TestSetup.request().post('/api/login').send({
        username: 'someuser',
      });

      expect(response.status).to.equal(401); // Matches Jest behavior - returns 401 not 400
    });

    it('should handle completely missing login parameters', async function () {
      const response = await TestSetup.request().post('/api/login').send({});

      expect(response.status).to.equal(401); // Matches Jest behavior - returns 401 not 400
    });
  });
});
