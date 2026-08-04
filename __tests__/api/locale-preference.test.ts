import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Content locale preference API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/users/me/locale-preference', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/users/me/locale-preference');
      expect(response.status).to.equal(401);
    });

    // Unlike themePreference this reports null rather than the default: the
    // client's own default is navigator.language, and answering 'en' here
    // would override the browser's answer on every device the user logs in on.
    it('returns null before the user has ever chosen', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.locale).to.equal(null);
    });
  });

  describe('PATCH /api/users/me/locale-preference', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .send({ locale: 'vi' });
      expect(response.status).to.equal(401);
    });

    it('sets the locale and it persists across requests', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'vi' });

      expect(response.status).to.equal(200);
      expect(response.body.locale).to.equal('vi');

      const reread = await TestSetup.request()
        .get('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`);
      expect(reread.body.locale).to.equal('vi');
    });

    // The content-language set is open by design — any language a user reads
    // and writes in, not the closed set we translate into.
    it('accepts a language with no UI build and no translation target', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'pt' });
      expect(response.status).to.equal(200);
      expect(response.body.locale).to.equal('pt');
    });

    // Stored values are compared for equality against Blueprint.sourceLang,
    // which the detector always writes as a base tag. A region-tagged
    // preference that survived would never match, silently costing the author
    // their own title.
    it('narrows a region-tagged value to its base tag', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'pt-BR' });
      expect(response.status).to.equal(200);
      expect(response.body.locale).to.equal('pt');
    });

    it('rejects values that are not language tags', async function () {
      const token = testData.users.user1.generateJwt();
      for (const bad of ['', 'english', '<script>', 42, { locale: 'en' }, null]) {
        const response = await TestSetup.request()
          .patch('/api/users/me/locale-preference')
          .set('Authorization', `Bearer ${token}`)
          .send({ locale: bad });
        expect(response.status).to.equal(400, `expected ${JSON.stringify(bad)} to be rejected`);
      }
    });

    it('rejects a missing locale', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).to.equal(400);
    });

    // Private account data — what you read in is nobody else's business.
    it('does not expose the locale on the public profile', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'ru' });

      const profile = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );
      expect(profile.status).to.equal(200);
      expect(profile.body).to.not.have.property('localePreference');
      expect(profile.body).to.not.have.property('locale');
    });
  });
});
