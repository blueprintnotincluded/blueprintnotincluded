import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { DEFAULT_THEME_ID } from '../../lib/index';

describe('Theme preference API', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/users/me/theme-preference', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().get('/api/users/me/theme-preference');
      expect(response.status).to.equal(401);
    });

    // An account that has never chosen resolves to the current default rather
    // than reporting null, so changing the default later reaches those users.
    it('returns the default before the user has ever chosen', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .get('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      expect(response.body.theme).to.equal(DEFAULT_THEME_ID);
    });
  });

  describe('PATCH /api/users/me/theme-preference', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .send({ theme: 'cyanotype' });
      expect(response.status).to.equal(401);
    });

    it('sets the theme and it persists across requests', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'cyanotype' });

      expect(response.status).to.equal(200);
      expect(response.body.theme).to.equal('cyanotype');

      const reread = await TestSetup.request()
        .get('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`);
      expect(reread.body.theme).to.equal('cyanotype');
    });

    it('overwrites a previous choice', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'film' });

      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'concrete' });

      expect(response.status).to.equal(200);
      expect(response.body.theme).to.equal('concrete');
    });

    // This value is written straight into a data-palette attribute on the
    // client, so it is validated against the shared id list, never free text.
    it('rejects an unknown theme id', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'hot-pink' });

      expect(response.status).to.equal(400);
    });

    it('rejects a non-string theme', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: { id: 'steam' } });

      expect(response.status).to.equal(400);
    });

    it('rejects a missing theme', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).to.equal(400);
    });

    it('saves a custom theme with colours and round-trips them', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom', customColors: { board: '#1B1D21', mark: '#1a9fff' } });

      expect(response.status).to.equal(200);
      expect(response.body.theme).to.equal('custom');
      // Normalised to lowercase on the way in.
      expect(response.body.customColors).to.deep.equal({ board: '#1b1d21', mark: '#1a9fff' });

      const reread = await TestSetup.request()
        .get('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`);
      expect(reread.body.theme).to.equal('custom');
      expect(reread.body.customColors).to.deep.equal({ board: '#1b1d21', mark: '#1a9fff' });
    });

    it('keeps the colour set when switching back to a prefab, and restores it on custom', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom', customColors: { board: '#101f2e' } });

      const prefab = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'film' });
      expect(prefab.status).to.equal(200);
      expect(prefab.body.theme).to.equal('film');

      // Custom with no colours in the body is valid because a set is stored.
      const back = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom' });
      expect(back.status).to.equal(200);
      expect(back.body.theme).to.equal('custom');
      expect(back.body.customColors).to.deep.equal({ board: '#101f2e' });
    });

    it('rejects custom with no colours sent and none stored', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom' });

      expect(response.status).to.equal(400);
      // And the account is not left pointing at a palette that doesn't exist.
      const reread = await TestSetup.request()
        .get('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`);
      expect(reread.body.theme).to.equal(DEFAULT_THEME_ID);
    });

    // These values reach CSS custom properties on the client, so anything
    // that is not a literal #rrggbb colour on a known token is refused whole.
    it('rejects a non-hex colour value', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom', customColors: { board: 'url(javascript:1)' } });
      expect(response.status).to.equal(400);
    });

    it('rejects an unknown token name', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom', customColors: { 'evil-token': '#123456' } });
      expect(response.status).to.equal(400);
    });

    it('rejects shorthand and alpha hex forms', async function () {
      const token = testData.users.user1.generateJwt();
      for (const bad of ['#abc', '#aabbccdd', 'red', 'rgb(1,2,3)']) {
        const response = await TestSetup.request()
          .patch('/api/users/me/theme-preference')
          .set('Authorization', `Bearer ${token}`)
          .send({ theme: 'custom', customColors: { board: bad } });
        expect(response.status).to.equal(400, `expected ${bad} to be rejected`);
      }
    });

    it('rejects an empty colour object', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'custom', customColors: {} });
      expect(response.status).to.equal(400);
    });

    // Cosmetic, but still private account state.
    it('does not expose the theme on the public profile', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/theme-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'cyanotype' });

      const profile = await TestSetup.request().get(
        `/api/users/${testData.users.user1.username}/profile`
      );
      if (profile.status === 200) {
        expect(profile.body).to.not.have.property('themePreference');
        expect(profile.body).to.not.have.property('theme');
        expect(profile.body).to.not.have.property('customThemeColors');
      }
    });
  });
});
