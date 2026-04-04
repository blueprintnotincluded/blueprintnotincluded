import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { UserModel } from '../../app/api/models/user';

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
      const response = await TestSetup.request().post('/api/register').send({
        username: 'newuser123',
        email: 'newuser@test.com',
        password: 'testpassword123',
      });

      expect(response.status).to.equal(200);
      expect(response.body.token).to.exist;
    });

    it('should reject a duplicate username', async function () {
      const response = await TestSetup.request().post('/api/register').send({
        username: testData.users.user1.username,
        email: 'unique@test.com',
        password: 'testpassword123',
      });

      expect(response.body.duplicateError).to.be.true;
    });

    it('should reject a duplicate email', async function () {
      const response = await TestSetup.request().post('/api/register').send({
        username: 'uniqueuser',
        email: testData.users.user1.email,
        password: 'testpassword123',
      });

      expect(response.body.duplicateError).to.be.true;
    });

    it('should reject a username with special characters', async function () {
      const response = await TestSetup.request().post('/api/register').send({
        username: 'invalid user!',
        email: 'valid@test.com',
        password: 'testpassword123',
      });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });

    it('should reject a username longer than 30 characters', async function () {
      const response = await TestSetup.request().post('/api/register').send({
        username: 'a'.repeat(31),
        email: 'valid@test.com',
        password: 'testpassword123',
      });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });
  });

  describe('POST /api/login', function () {
    it('should successfully login with valid credentials', async function () {
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

  describe('POST /api/request-reset', function () {
    it('should return 404 for a nonexistent email', async function () {
      const response = await TestSetup.request()
        .post('/api/request-reset')
        .send({ email: 'nobody@nowhere.com' });

      expect(response.status).to.equal(404);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].title).to.equal('User not found');
    });

    it('should save a reset token for a valid email', async function () {
      const email = testData.users.user1.email;

      const response = await TestSetup.request()
        .post('/api/request-reset')
        .send({ email });

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal('Password reset email sent');

      const updated = await UserModel.model.findById(testData.users.user1._id);
      expect(updated?.resetToken).to.be.a('string').and.have.length.greaterThan(0);
      expect(updated?.resetTokenExpiration).to.be.a('date');
      expect(updated!.resetTokenExpiration!.getTime()).to.be.greaterThan(Date.now());
    });
  });

  describe('POST /api/reset-password', function () {
    it('should reject an invalid token', async function () {
      const response = await TestSetup.request()
        .post('/api/reset-password')
        .send({ token: 'bogus-token', newPassword: 'newpassword123' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].title).to.equal('Invalid or expired reset token');
    });

    it('should reject an expired token', async function () {
      await UserModel.model.findByIdAndUpdate(testData.users.user1._id, {
        resetToken: 'expired-token',
        resetTokenExpiration: new Date(Date.now() - 1000), // 1 second in the past
      });

      const response = await TestSetup.request()
        .post('/api/reset-password')
        .send({ token: 'expired-token', newPassword: 'newpassword123' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].title).to.equal('Invalid or expired reset token');
    });

    it('should reset the password and allow login with the new password', async function () {
      this.timeout(30000);
      // Register a user so we have a real, known password
      const registerResponse = await TestSetup.request().post('/api/register').send({
        username: 'resettest',
        email: 'resettest@test.com',
        password: 'oldpassword123',
      });
      expect(registerResponse.status).to.equal(200);

      // Seed a valid reset token directly
      const user = await UserModel.model.findOne({ username: 'resettest' });
      const testToken = 'valid-reset-token-abc123';
      await UserModel.model.findByIdAndUpdate(user!._id, {
        resetToken: testToken,
        resetTokenExpiration: new Date(Date.now() + 3600000),
      });

      // Reset the password
      const resetResponse = await TestSetup.request()
        .post('/api/reset-password')
        .send({ token: testToken, newPassword: 'newpassword456' });

      expect(resetResponse.status).to.equal(200);
      expect(resetResponse.body.message).to.equal('Password successfully reset');

      // Old password should no longer work
      const oldLogin = await TestSetup.request()
        .post('/api/login')
        .send({ username: 'resettest', password: 'oldpassword123' });
      expect(oldLogin.status).to.equal(401);

      // New password should work
      const newLogin = await TestSetup.request()
        .post('/api/login')
        .send({ username: 'resettest', password: 'newpassword456' });
      expect(newLogin.status).to.equal(200);
      expect(newLogin.body.token).to.exist;
    });

    it('should clear the reset token after use so it cannot be reused', async function () {
      await UserModel.model.findByIdAndUpdate(testData.users.user1._id, {
        resetToken: 'one-time-token',
        resetTokenExpiration: new Date(Date.now() + 3600000),
      });

      const first = await TestSetup.request()
        .post('/api/reset-password')
        .send({ token: 'one-time-token', newPassword: 'firstnewpass123' });
      expect(first.status).to.equal(200);

      const second = await TestSetup.request()
        .post('/api/reset-password')
        .send({ token: 'one-time-token', newPassword: 'secondnewpass123' });
      expect(second.status).to.equal(400);
    });
  });
});
