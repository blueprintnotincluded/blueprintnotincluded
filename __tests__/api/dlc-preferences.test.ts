import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('DLC exclusion preferences API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/users/me/dlc-preferences', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/users/me/dlc-preferences');
      expect(response.status).to.equal(401);
    });

    it('returns an empty exclusion list before the user has ever interacted', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal([]);
    });
  });

  describe('PATCH /api/users/me/dlc-preferences', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .send({ excludedDlcs: ['DLC3_ID'] });
      expect(response.status).to.equal(401);
    });

    it('sets the exclusion list and it persists across requests', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC3_ID', 'DLC4_ID'] });

      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal(['DLC3_ID', 'DLC4_ID']);

      const reread = await TestSetup.request()
        .get('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`);
      expect(reread.body.excludedDlcs).to.deep.equal(['DLC3_ID', 'DLC4_ID']);
    });

    it('overwrites (not merges) on a second call', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC3_ID'] });

      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC5_ID'] });

      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal(['DLC5_ID']);
    });

    it('clears the exclusion list with an empty array', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC3_ID'] });

      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: [] });

      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal([]);
    });

    it('rejects a non-array body', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: 'DLC3_ID' });
      expect(response.status).to.equal(400);
    });

    it('rejects a malformed id', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['dlc3_id'] });
      expect(response.status).to.equal(400);
    });

    it('rejects an oversized list', async function () {
      const token = testData.users.user1.generateJwt();
      const many = Array.from({ length: 21 }, (_, i) => `DLC${i}_ID`);
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: many });
      expect(response.status).to.equal(400);
    });

    it("accepts an unknown but well-formed id (a pack without a label yet)", async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC99_ID'] });
      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal(['DLC99_ID']);
    });
  });

  describe('privacy: the preference never leaks into another user\'s view', function () {
    it('is absent from the public profile response', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ excludedDlcs: ['DLC3_ID'] });

      const profile = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );
      expect(profile.status).to.equal(200);
      expect(profile.body).to.not.have.property('excludedDlcs');
      expect(profile.body).to.not.have.property('dlcPreferences');
    });

    it('is absent from the profileSecure response seen by another logged-in user', async function () {
      const token1 = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token1}`)
        .send({ excludedDlcs: ['DLC3_ID'] });

      const token2 = testData.users.user2.generateJwt();
      const profile = await TestSetup.request()
        .get(`/api/users/${testData.users.user1.username}/profileSecure`)
        .set('Authorization', `Bearer ${token2}`);

      expect(profile.status).to.equal(200);
      expect(profile.body).to.not.have.property('excludedDlcs');
      expect(profile.body).to.not.have.property('dlcPreferences');
    });

    it('GET /api/users/me/dlc-preferences only ever returns the caller\'s own preference', async function () {
      const token1 = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token1}`)
        .send({ excludedDlcs: ['DLC3_ID'] });

      const token2 = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .get('/api/users/me/dlc-preferences')
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).to.equal(200);
      expect(response.body.excludedDlcs).to.deep.equal([]);
    });
  });
});
