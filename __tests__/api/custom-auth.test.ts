import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { generateUniqueUsername } from '../../app/api/auth-controller';

describe('Custom Auth API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // ─── POST /api/auth/login ────────────────────────────────────────────────────

  describe('POST /api/auth/login', function () {
    it('should return 400 when email is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ password: 'hunter2' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when password is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: 'user@example.com' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when body is empty', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({});
      expect(response.status).to.equal(400);
    });

    it('should return legacy_account error for a legacy user when WorkOS auth fails', async function () {
      // testData users are legacy (authProvider: 'legacy') and have no workosUserId.
      // WorkOS auth will fail (dummy API key in test env), the controller falls back to the
      // DB check and finds a legacy user → returns legacy_account.
      this.timeout(10000);
      const legacyUser = testData.users.user1;
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: legacyUser.email, password: 'any-password' });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal('legacy_account');
    });

    it('should return invalid_credentials for an unknown email when WorkOS auth fails', async function () {
      this.timeout(10000);
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: 'nobody@unknown.example', password: 'any-password' });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal('invalid_credentials');
    });
  });

  // ─── POST /api/auth/register ─────────────────────────────────────────────────

  describe('POST /api/auth/register', function () {
    it('should return 400 when email is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ password: 'hunter2', username: 'newuser' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when password is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: 'new@example.com', username: 'newuser' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when username is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'hunter2' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 for invalid username characters', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'hunter2', username: 'bad user!' });
      expect(response.status).to.equal(400);
    });

    it('should return 409 when username is already taken', async function () {
      const existingUser = testData.users.user1;
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: 'brand-new@example.com', password: 'hunter2', username: existingUser.username });
      expect(response.status).to.equal(409);
      expect(response.body.errors[0].title).to.include('taken');
    });
  });

  // ─── POST /api/auth/send-magic ───────────────────────────────────────────────

  describe('POST /api/auth/send-magic', function () {
    it('should return 400 when email is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/send-magic')
        .send({});
      expect(response.status).to.equal(400);
    });
  });

  // ─── POST /api/auth/verify-magic ─────────────────────────────────────────────

  describe('POST /api/auth/verify-magic', function () {
    it('should return 400 when code is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/verify-magic')
        .send({ email: 'user@example.com' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when email is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/verify-magic')
        .send({ code: 'some-code' });
      expect(response.status).to.equal(400);
    });
  });

  // ─── POST /api/auth/forgot-password ──────────────────────────────────────────

  describe('POST /api/auth/forgot-password', function () {
    it('should return 400 when email is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/forgot-password')
        .send({});
      expect(response.status).to.equal(400);
    });
  });

  // ─── POST /api/auth/reset-password ───────────────────────────────────────────

  describe('POST /api/auth/reset-password', function () {
    it('should return 400 when token is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/reset-password')
        .send({ newPassword: 'newpass123' });
      expect(response.status).to.equal(400);
    });

    it('should return 400 when newPassword is missing', async function () {
      const response = await TestSetup.request()
        .post('/api/auth/reset-password')
        .send({ token: 'some-token' });
      expect(response.status).to.equal(400);
    });
  });

  // ─── generateUniqueUsername ───────────────────────────────────────────────────

  describe('generateUniqueUsername', function () {
    it('returns the base username when it is not taken', async function () {
      const result = await generateUniqueUsername('alice', async () => null);
      expect(result).to.equal('alice');
    });

    it('appends a counter when the base username is taken', async function () {
      // 'alice' is taken, 'alice1' is free
      const result = await generateUniqueUsername('alice', async (u) => (u === 'alice' ? {} : null));
      expect(result).to.equal('alice1');
    });

    it('increments the counter until a free username is found', async function () {
      // 'bob', 'bob1', 'bob2' are taken; 'bob3' is free
      const taken = new Set(['bob', 'bob1', 'bob2']);
      const result = await generateUniqueUsername('bob', async (u) => (taken.has(u) ? {} : null));
      expect(result).to.equal('bob3');
    });

    it('throws after maxAttempts when no unique username can be found', async function () {
      // Every candidate is "taken"
      let threw = false;
      try {
        await generateUniqueUsername('x', async () => ({}), 3);
      } catch (err: any) {
        threw = true;
        expect(err.message).to.include('Could not generate a unique username');
        expect(err.message).to.include('"x"');
        expect(err.message).to.include('3 attempts');
      }
      expect(threw).to.equal(true);
    });
  });

  // ─── Confirm endpoints require no JWT ────────────────────────────────────────

  describe('Auth endpoints are publicly accessible (no JWT required)', function () {
    const publicEndpoints = [
      { method: 'post', path: '/api/auth/login' },
      { method: 'post', path: '/api/auth/register' },
      { method: 'post', path: '/api/auth/send-magic' },
      { method: 'post', path: '/api/auth/verify-magic' },
      { method: 'post', path: '/api/auth/forgot-password' },
      { method: 'post', path: '/api/auth/reset-password' },
    ] as const;

    for (const { method, path: endpoint } of publicEndpoints) {
      it(`${method.toUpperCase()} ${endpoint} should not return 401 (no JWT sent)`, async function () {
        // We send an empty body — the endpoint will return 400 (validation) not 401 (auth)
        const response = await (TestSetup.request() as any)[method](endpoint).send({});
        expect(response.status).to.not.equal(401);
      });
    }
  });
});
