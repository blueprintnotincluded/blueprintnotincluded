import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { UserJwt } from '../../app/api/models/user';

const ENDPOINT = '/api/admin/alpha/toggle';

function decode(token: string): UserJwt {
  return jwt.decode(token) as UserJwt;
}

describe('POST /api/admin/alpha/toggle', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  it('should return 401 without a token', async function () {
    const response = await TestSetup.request().post(ENDPOINT);
    expect(response.status).to.equal(401);
  });

  it('should return 403 for a non-admin user', async function () {
    const token = testData.users.user1.generateJwt();
    const response = await TestSetup.request()
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).to.equal(403);
  });

  it('should return 200 with a JWT carrying isAlpha:true for an admin', async function () {
    const adminToken = testData.users.user1.generateJwt('admin');
    const response = await TestSetup.request()
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).to.equal(200);
    expect(response.body.token).to.be.a('string');

    const claims = decode(response.body.token);
    expect(claims.isAlpha).to.equal(true);
    expect(claims.role).to.equal('admin');
  });

  it('should drop the isAlpha claim on a second toggle (back to false)', async function () {
    const adminToken = testData.users.user1.generateJwt('admin');

    const first = await TestSetup.request()
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(decode(first.body.token).isAlpha).to.equal(true);

    const second = await TestSetup.request()
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(second.status).to.equal(200);
    // isAlpha is omitted from the JWT when false
    expect(decode(second.body.token).isAlpha).to.be.undefined;
  });

  it('should persist isAlpha server-side across the toggle', async function () {
    const adminToken = testData.users.user1.generateJwt('admin');
    await TestSetup.request()
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);

    const { UserModel } = await import('../../app/api/models/user');
    const reloaded = await UserModel.model.findById(testData.users.user1._id);
    expect(reloaded!.isAlpha).to.equal(true);
  });
});
