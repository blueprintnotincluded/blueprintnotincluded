import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';

import { TestSetup } from '../setup/testSetup';
import { UserModel } from '../../app/api/models/user';
import { WorkOSService } from '../../app/api/services/workos-service';
import { DEV_USERS, DEV_PASSWORD, ensureDevUsers } from '../../app/api/dev-users';

describe('Local auth mode', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    sinon.restore();
    delete process.env.AUTH_MODE;
    await TestSetup.afterEach();
  });

  describe('GET /api/auth/mode', function () {
    it('reports workos mode with no dev users by default', async function () {
      const response = await TestSetup.request().get('/api/auth/mode');
      expect(response.status).to.equal(200);
      expect(response.body.mode).to.equal('workos');
      expect(response.body.devUsers).to.deep.equal([]);
      expect(response.body.devPassword).to.equal(undefined);
    });

    it('reports local mode with the dev user roster and shared password', async function () {
      process.env.AUTH_MODE = 'local';
      const response = await TestSetup.request().get('/api/auth/mode');
      expect(response.status).to.equal(200);
      expect(response.body.mode).to.equal('local');
      expect(response.body.devUsers).to.have.length(DEV_USERS.length);
      expect(response.body.devUsers.map((u: any) => u.username)).to.include('dev_you');
      expect(response.body.devPassword).to.equal(DEV_PASSWORD);
      // Never leaks a password hash/salt
      for (const u of response.body.devUsers) {
        expect(u).to.not.have.property('hash');
        expect(u).to.not.have.property('salt');
      }
    });
  });

  describe('POST /api/auth/login (local mode)', function () {
    it('logs in a legacy user with the correct password and carries their localRole', async function () {
      process.env.AUTH_MODE = 'local';
      const user = new UserModel.model({
        username: `local_admin_${Date.now()}`,
        email: `local_admin_${Date.now()}@bpni.local`,
        authProvider: 'legacy',
        localRole: 'admin',
      });
      user.setPassword('correct horse battery staple');
      await user.save();

      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'correct horse battery staple' });

      expect(response.status).to.equal(200);
      const decoded: any = jwt.verify(response.body.token, process.env.JWT_SECRET as string);
      expect(decoded.role).to.equal('admin');
      expect(decoded.username).to.equal(user.username);
    });

    it('rejects the wrong password', async function () {
      process.env.AUTH_MODE = 'local';
      const user = new UserModel.model({
        username: `local_wrong_${Date.now()}`,
        email: `local_wrong_${Date.now()}@bpni.local`,
        authProvider: 'legacy',
      });
      user.setPassword('right-password');
      await user.save();

      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal('invalid_credentials');
    });

    it('rejects a workos-provider user even with a valid password hash set', async function () {
      process.env.AUTH_MODE = 'local';
      const user = new UserModel.model({
        username: `local_workos_${Date.now()}`,
        email: `local_workos_${Date.now()}@bpni.local`,
        authProvider: 'workos',
      });
      user.setPassword('some-password');
      await user.save();

      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'some-password' });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal('invalid_credentials');
    });

    it('rejects an unknown email', async function () {
      process.env.AUTH_MODE = 'local';
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: 'nobody@bpni.local', password: 'whatever' });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal('invalid_credentials');
    });
  });

  describe('POST /api/auth/register (local mode)', function () {
    it('creates a legacy user and returns a usable token with no email verification step', async function () {
      process.env.AUTH_MODE = 'local';
      const email = `new_local_${Date.now()}@example.com`;
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email, password: 'hunter2', username: `newlocal${Date.now()}` });

      expect(response.status).to.equal(201);
      expect(response.body.token).to.be.a('string');

      const created = await UserModel.model.findOne({ email });
      expect(created).to.not.equal(null);
      expect(created!.authProvider).to.equal('legacy');
      expect(created!.validPassword('hunter2')).to.equal(true);
    });

    it('returns 409 when the email is already registered', async function () {
      process.env.AUTH_MODE = 'local';
      const existing = testData.users.user1;
      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: existing.email, password: 'hunter2', username: `brandnew${Date.now()}` });

      expect(response.status).to.equal(409);
    });
  });

  describe('Endpoints unavailable in local mode', function () {
    const cases = [
      { method: 'post', path: '/api/auth/send-magic', body: { email: 'a@bpni.local' } },
      { method: 'post', path: '/api/auth/verify-magic', body: { email: 'a@bpni.local', code: 'x' } },
      { method: 'post', path: '/api/auth/forgot-password', body: { email: 'a@bpni.local' } },
      { method: 'post', path: '/api/auth/reset-password', body: { token: 'x', newPassword: 'y' } },
      { method: 'post', path: '/api/auth/verify-email', body: { code: 'x', userId: 'y' } },
    ] as const;

    for (const { method, path: endpoint, body } of cases) {
      it(`${method.toUpperCase()} ${endpoint} returns 501 in local mode`, async function () {
        process.env.AUTH_MODE = 'local';
        const response = await (TestSetup.request() as any)[method](endpoint).send(body);
        expect(response.status).to.equal(501);
        expect(response.body.error).to.equal('not_available_in_local_mode');
      });
    }
  });

  describe('Workos mode leaves local auth untouched', function () {
    it('never checks a stored password when WorkOS auth fails', async function () {
      sinon.stub(WorkOSService, 'authenticateWithPassword').rejects(new Error('workos down'));
      const validPasswordSpy = sinon.spy(UserModel.model.prototype, 'validPassword');

      const legacyUser = testData.users.user1;
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: legacyUser.email, password: 'any-password' });

      expect(response.status).to.equal(401);
      expect(validPasswordSpy.called).to.equal(false);
    });
  });

  describe('ensureDevUsers', function () {
    it('is idempotent and leaves six users with the fixed ids and a working password', async function () {
      // Each run hashes six real PBKDF2 passwords (~3s each on this hardware) —
      // budget generously for two full runs back to back.
      this.timeout(90000);
      await ensureDevUsers();
      await ensureDevUsers();

      const found = await UserModel.model.find({ _id: { $in: DEV_USERS.map(u => u._id) } });
      expect(found).to.have.length(DEV_USERS.length);

      const devYou = found.find(u => u.username === 'dev_you')!;
      expect(devYou.authProvider).to.equal('legacy');
      expect(devYou.localRole).to.equal('admin');
      expect(devYou.validPassword(DEV_PASSWORD)).to.equal(true);

      const lurker = found.find(u => u.username === 'dev_lurker')!;
      expect(lurker.localRole).to.equal(undefined);
    });
  });
});
