import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { UserModel } from '../../app/api/models/user';
import { WorkOSService } from '../../app/api/services/workos-service';
import { provisionWorkOSUsers } from '../../scripts/provision-workos-users';

describe('provisionWorkOSUsers', function () {
  let provisionStub: sinon.SinonStub;
  let ensureOrgStub: sinon.SinonStub;

  beforeEach(async function () {
    this.timeout(5000);
    await TestSetup.beforeEach();
    delete process.env.WORKOS_PLATFORM_ORG_ID;
    provisionStub = sinon.stub(WorkOSService, 'provisionUser');
    ensureOrgStub = sinon.stub(WorkOSService, 'ensureOrgMembership');
    // Default: succeed for any email (handles the 3 seeded legacy users)
    provisionStub.callsFake(async (email: string) => ({
      user: { id: `wos_${email}`, email },
      created: true,
    }));
    ensureOrgStub.resolves({ membershipId: 'mem_default', created: true });
  });

  afterEach(async function () {
    this.timeout(5000);
    sinon.restore();
    await TestSetup.afterEach();
  });

  async function createLegacyUser(email: string, username: string) {
    const user = new UserModel.model({ email, username, authProvider: 'legacy' });
    user.setPassword('password123');
    await user.save();
    return user;
  }

  it('provisions legacy users without a workosUserId', async function () {
    const user = await createLegacyUser('alice@example.com', 'alice');

    const result = await provisionWorkOSUsers();

    expect(result.errorCount).to.equal(0);
    // The specific user we created must be provisioned
    const updated = await UserModel.model.findById(user._id).lean();
    expect(updated?.workosUserId).to.equal(`wos_alice@example.com`);
  });

  it('calls provisionUser with the correct email and mongoId', async function () {
    const user = await createLegacyUser('bob@example.com', 'bob');

    await provisionWorkOSUsers();

    const callForBob = provisionStub.getCalls().find((c) => c.args[0] === 'bob@example.com');
    expect(callForBob, 'expected a provisionUser call for bob@example.com').to.exist;
    expect(callForBob!.args[1]).to.equal(String(user._id));
  });

  it('counts alreadyExisted when WorkOS returns created: false', async function () {
    const user = await createLegacyUser('carol@example.com', 'carol');
    provisionStub.withArgs('carol@example.com', sinon.match.string).resolves({
      user: { id: 'wos_carol', email: 'carol@example.com' },
      created: false,
    });

    const result = await provisionWorkOSUsers();

    expect(result.alreadyExisted).to.equal(1);
    // workosUserId should still be written back
    const updated = await UserModel.model.findById(user._id).lean();
    expect(updated?.workosUserId).to.equal('wos_carol');
  });

  it('re-confirms users that already have a workosUserId (idempotent)', async function () {
    const alreadyProvisioned = new UserModel.model({
      email: 'dave@example.com',
      username: 'dave',
      authProvider: 'legacy',
      workosUserId: 'wos_existing',
    });
    await alreadyProvisioned.save();
    provisionStub
      .withArgs('dave@example.com', sinon.match.string)
      .resolves({ user: { id: 'wos_existing', email: 'dave@example.com' }, created: false });

    const result = await provisionWorkOSUsers();

    const callForDave = provisionStub.getCalls().find((c) => c.args[0] === 'dave@example.com');
    expect(callForDave, 'should call provisionUser to confirm the WorkOS account').to.exist;
    expect(result.alreadyExisted).to.be.at.least(1);

    // workosUserId must remain unchanged
    const unchanged = await UserModel.model.findById(alreadyProvisioned._id).lean();
    expect(unchanged?.workosUserId).to.equal('wos_existing');
  });

  it('re-links a user whose WorkOS account was deleted and recreated', async function () {
    const user = new UserModel.model({
      email: 'relinked@example.com',
      username: 'relinked',
      authProvider: 'legacy',
      workosUserId: 'wos_old_id',
    });
    await user.save();
    // WorkOS recreated the account with a new ID (old was deleted)
    provisionStub
      .withArgs('relinked@example.com', sinon.match.string)
      .resolves({ user: { id: 'wos_new_id', email: 'relinked@example.com' }, created: true });

    await provisionWorkOSUsers();

    const updated = await UserModel.model.findById(user._id).lean();
    expect(updated?.workosUserId).to.equal('wos_new_id');
  });

  it('records errors without aborting other users', async function () {
    await createLegacyUser('good@example.com', 'good');
    await createLegacyUser('bad@example.com', 'bad');

    provisionStub.withArgs('bad@example.com', sinon.match.string).rejects(new Error('API timeout'));

    const result = await provisionWorkOSUsers();

    expect(result.errorCount).to.equal(1);
    expect(result.errors[0].email).to.equal('bad@example.com');
    expect(result.errors[0].error).to.equal('API timeout');

    // good@example.com should still have been provisioned
    const good = await UserModel.model.findOne({ email: 'good@example.com' }).lean();
    expect(good?.workosUserId).to.exist;
  });

  it('does not call WorkOS or update the DB in dry-run mode', async function () {
    const user = await createLegacyUser('eve@example.com', 'eve');

    await provisionWorkOSUsers({ dryRun: true });

    expect(provisionStub.called).to.be.false;
    const unchanged = await UserModel.model.findById(user._id).lean();
    expect(unchanged?.workosUserId).to.be.undefined;
  });

  it('is idempotent — re-running counts already-provisioned users as alreadyExisted', async function () {
    const user = new UserModel.model({
      email: 'frank@example.com',
      username: 'frank',
      authProvider: 'legacy',
      workosUserId: 'wos_frank',
    });
    await user.save();
    provisionStub
      .withArgs('frank@example.com', sinon.match.string)
      .resolves({ user: { id: 'wos_frank', email: 'frank@example.com' }, created: false });

    const result = await provisionWorkOSUsers();

    const callForFrank = provisionStub.getCalls().find((c) => c.args[0] === 'frank@example.com');
    expect(callForFrank, 'should confirm the WorkOS account on re-run').to.exist;
    expect(result.alreadyExisted).to.be.at.least(1);

    const unchanged = await UserModel.model.findById(user._id).lean();
    expect(unchanged?.workosUserId).to.equal('wos_frank');
  });

  describe('org membership (WORKOS_PLATFORM_ORG_ID set)', function () {
    beforeEach(function () {
      process.env.WORKOS_PLATFORM_ORG_ID = 'org_test123';
    });

    it('calls ensureOrgMembership with the WorkOS user id and org id', async function () {
      await createLegacyUser('org-test@example.com', 'orgtest');

      await provisionWorkOSUsers();

      const call = ensureOrgStub
        .getCalls()
        .find((c) => c.args[0] === `wos_org-test@example.com`);
      expect(call, 'expected ensureOrgMembership call for org-test user').to.exist;
      expect(call!.args[1]).to.equal('org_test123');
    });

    it('counts orgMembershipsCreated and orgMembershipsExisted separately', async function () {
      await createLegacyUser('new-member@example.com', 'newmember');
      await createLegacyUser('old-member@example.com', 'oldmember');

      // Seeded users return existed; only the two test users differ
      ensureOrgStub.resolves({ membershipId: 'mem_default', created: false });
      ensureOrgStub
        .withArgs(`wos_new-member@example.com`, sinon.match.string)
        .resolves({ membershipId: 'mem_new', created: true });
      ensureOrgStub
        .withArgs(`wos_old-member@example.com`, sinon.match.string)
        .resolves({ membershipId: 'mem_old', created: false });

      const result = await provisionWorkOSUsers();

      expect(result.orgMembershipsCreated).to.equal(1);
      expect(result.orgMembershipsExisted).to.be.at.least(1);
    });

    it('does not call ensureOrgMembership in dry-run mode', async function () {
      await createLegacyUser('dry@example.com', 'dry');

      await provisionWorkOSUsers({ dryRun: true });

      expect(ensureOrgStub.called).to.be.false;
    });
  });

  it('skips users with no email address', async function () {
    await UserModel.model.collection.insertOne({
      username: 'noemail',
      authProvider: 'legacy',
      hash: 'x',
      salt: 'x',
    });
    const callsBefore = provisionStub.callCount;

    const result = await provisionWorkOSUsers();

    expect(result.skipped).to.equal(1);
    // no additional WorkOS call for the no-email user
    const callsForNoEmail = provisionStub.getCalls().find((c) => !c.args[0]);
    expect(callsForNoEmail).to.not.exist;
    expect(provisionStub.callCount).to.equal(callsBefore + result.totalFound - result.skipped);
  });
});
