import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const BASE_BODY = {
  name: 'Meta Test Blueprint',
  blueprint: { version: '1.0', buildings: [] },
  thumbnail: TINY_PNG,
};

describe('Blueprint metadata API', function () {
  let authToken: string;

  beforeEach(async function () {
    this.timeout(15000);
    const testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('POST /api/uploadblueprint — metadata fields', function () {
    it('persists valid metadata and round-trips through list API', async function () {
      const upload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...BASE_BODY,
          gameVersion: 'spacedOut',
          category: 'power',
          subcategory: 'generator',
          description: 'A great power setup',
          researchTier: 'advanced',
          modded: true,
          multiplayerSafe: false,
        });

      expect(upload.status).to.equal(200);
      const id = upload.body.id;

      const saved = await BlueprintModel.model.findById(id);
      expect(saved!.gameVersion).to.equal('spacedOut');
      expect(saved!.category).to.equal('power');
      expect(saved!.subcategory).to.equal('generator');
      expect(saved!.description).to.equal('A great power setup');
      expect(saved!.researchTier).to.equal('advanced');
      expect(saved!.modded).to.be.true;
      expect(saved!.multiplayerSafe).to.be.false;

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(list.status).to.equal(200);
      const item = list.body.blueprints.find((bp: any) => bp.id === id);
      expect(item).to.exist;
      expect(item.gameVersion).to.equal('spacedOut');
      expect(item.category).to.equal('power');
      expect(item.description).to.equal('A great power setup');
      expect(item.modded).to.be.true;
    });

    it('saves with null metadata when fields omitted', async function () {
      const upload = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send(BASE_BODY);

      expect(upload.status).to.equal(200);

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      const item = list.body.blueprints.find((bp: any) => bp.name === 'Meta Test Blueprint');
      expect(item).to.exist;
      expect(item.gameVersion ?? null).to.be.null;
      expect(item.category ?? null).to.be.null;
    });

    it('rejects unknown gameVersion with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, gameVersion: 'notARealVersion' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects unknown category with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, category: 'magic' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects subcategory that does not belong to category with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, category: 'power', subcategory: 'electrolyzer' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects unknown researchTier with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, researchTier: 'superAdvanced' });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });

    it('rejects description over 500 characters with 400', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, description: 'x'.repeat(501) });

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
    });
  });

  describe('GET /api/getblueprints — facet filter params', function () {
    beforeEach(async function () {
      // Seed two tagged blueprints
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Power Blueprint', gameVersion: 'base', category: 'power' });

      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Oxygen Blueprint', gameVersion: 'spacedOut', category: 'oxygenGen' });
    });

    it('filters by gameVersion', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'base' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Power Blueprint');
      expect(names).to.not.include('Oxygen Blueprint');
    });

    it('filters by category', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'oxygenGen' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Oxygen Blueprint');
      expect(names).to.not.include('Power Blueprint');
    });

    it('filters by gameVersion and category together', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'spacedOut', category: 'oxygenGen' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.include('Oxygen Blueprint');
      expect(names).to.not.include('Power Blueprint');
    });

    it('returns 400 for unknown gameVersion filter', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), gameVersion: 'notAVersion' });

      expect(response.status).to.equal(400);
    });

    it('returns 400 for unknown category filter', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'notACategory' });

      expect(response.status).to.equal(400);
    });

    it('untagged blueprints are excluded when a category filter is active', async function () {
      // Seed an untagged blueprint
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...BASE_BODY, name: 'Untagged Blueprint' });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), category: 'power' });

      expect(response.status).to.equal(200);
      const names = response.body.blueprints.map((bp: any) => bp.name);
      expect(names).to.not.include('Untagged Blueprint');
    });
  });
});
