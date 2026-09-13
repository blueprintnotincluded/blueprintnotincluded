import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';

import { TestSetup } from '../setup/testSetup';
import { UserModel } from '../../app/api/models/user';
import { WorkOSService } from '../../app/api/services/workos-service';
import { BOOT_DEV_USERS, DEV_USERS, DEV_PASSWORD, ensureDevUsers } from '../../app/api/dev-users';

// crypto-js 4.2.0: PBKDF2('dev_password', '00112233445566778899aabbccddeeff', { keySize: 512 / 32 }).toString(Hex)
const CRYPTO_JS_FIXTURE_HASH =
  '0a3ec56bc20db87a2cf28fb1e4058c14726a4a352e9efa7b82a321678f268d1ab03767a400f2cfa637517375b33e05ae0b3d5d9d5deaa2e76d84c9f2f3f1a8ea';

describe('Local auth mode', function () {
  let testData: any;
  // The devcontainer sets AUTH_MODE=local on the container itself, so the
  // process under test may already be in local mode. Every case here states
  // the mode it needs; the ambient value is put back afterwards.
  const originalAuthMode = process.env.AUTH_MODE;

  beforeEach(async function () {
    this.timeout(5000);
    delete process.env.AUTH_MODE;
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    sinon.restore();
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
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
      // Only the accounts that actually exist at boot are offered — the full
      // social-graph roster is a seed:dev-blueprints concern.
      expect(response.body.devUsers).to.have.length(BOOT_DEV_USERS.length);
      expect(response.body.devUsers.map((u: any) => u.username)).to.include('dev_you');
      expect(BOOT_DEV_USERS.length).to.be.lessThan(DEV_USERS.length);
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

    it('returns 503 instead of a misleading invalid_credentials while dev users are still provisioning', async function () {
      // ensureDevUsers runs fire-and-forget from db.ts — a login landing
      // before it finishes must not see a false invalid_credentials for a dev
      // user that isn't seeded yet. Provisioning is now fast (native PBKDF2),
      // so hold its first write open on a gate rather than racing the clock.
      this.timeout(10000);
      process.env.AUTH_MODE = 'local';
      let release!: () => void;
      const gate = new Promise<void>(resolve => (release = resolve));
      const model: any = UserModel.model;
      const realFindOneAndUpdate = model.findOneAndUpdate;
      const stub = sinon.stub(model, 'findOneAndUpdate').callsFake((...args: any[]) => {
        stub.restore();
        return gate.then(() => realFindOneAndUpdate.apply(model, args));
      });
      const provisioning = ensureDevUsers();

      try {
        const response = await TestSetup.request()
          .post('/api/auth/login')
          .send({ email: 'dev_you@bpni.local', password: DEV_PASSWORD });

        expect(response.status).to.equal(503);
        expect(response.body.error).to.equal('local_auth_provisioning');
      } finally {
        // Must complete before afterEach's cleanDatabase runs, win or lose —
        // otherwise a failed assertion above leaves this upserting users
        // concurrently with the next test's cleanup/setup.
        release();
        await provisioning;
      }
    });

    it('logs a boot-roster dev user in once provisioning has finished', async function () {
      this.timeout(10000);
      process.env.AUTH_MODE = 'local';
      await ensureDevUsers();

      const response = await TestSetup.request()
        .post('/api/auth/login')
        .send({ email: 'dev_you@bpni.local', password: DEV_PASSWORD });

      expect(response.status).to.equal(200);
      const decoded: any = jwt.verify(response.body.token, process.env.JWT_SECRET as string);
      expect(decoded.role).to.equal('admin');
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

    it('returns 409 (not 500) when a conflicting user is created between the pre-checks and the insert', async function () {
      process.env.AUTH_MODE = 'local';
      const existing = testData.users.user1;
      // Force both pre-checks to report "not taken" even though `existing`
      // really does hold this email — the same outcome a concurrent
      // registration racing past the checks would produce — so the actual
      // save() hits the real unique index and the catch branch has to
      // handle a genuine MongoDB E11000, not a mocked one.
      sinon.stub(UserModel.model, 'findOne').resolves(null);

      const response = await TestSetup.request()
        .post('/api/auth/register')
        .send({ email: existing.email, password: 'hunter2', username: `brandnew${Date.now()}` });

      expect(response.status).to.equal(409);
      expect(response.body.errors[0].title).to.include('already exists');
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
    it('is idempotent and leaves the boot roster with the fixed ids and a working password', async function () {
      // Two runs back to back: two users, one native PBKDF2 each — the whole
      // thing is well under a second, and that budget is the point.
      this.timeout(5000);
      const started = Date.now();
      await ensureDevUsers();
      await ensureDevUsers();
      expect(Date.now() - started).to.be.lessThan(2000);

      const found = await UserModel.model.find({ _id: { $in: DEV_USERS.map(u => u._id) } });
      expect(found).to.have.length(BOOT_DEV_USERS.length);

      const devYou = found.find(u => u.username === 'dev_you')!;
      expect(devYou.authProvider).to.equal('legacy');
      expect(devYou.localRole).to.equal('admin');
      expect(devYou.validPassword(DEV_PASSWORD)).to.equal(true);

      const alpha = found.find(u => u.username === 'dev_creator_alpha')!;
      expect(alpha.localRole).to.equal(undefined);
      expect(alpha.validPassword(DEV_PASSWORD)).to.equal(true);
    });

    it('produces hashes byte-identical to the crypto-js 4.2 implementation it replaced', function () {
      // A fixture hashed by crypto-js PBKDF2(password, salt, { keySize: 512/32 })
      // under 4.2.0 defaults. If this stops matching, every stored legacy
      // password silently stops validating.
      const user = new UserModel.model({ authProvider: 'legacy' });
      (user as any).salt = '00112233445566778899aabbccddeeff';
      (user as any).hash = CRYPTO_JS_FIXTURE_HASH;
      expect(user.validPassword('dev_password')).to.equal(true);
      expect(user.validPassword('dev_passwor')).to.equal(false);
    });
  });
});
