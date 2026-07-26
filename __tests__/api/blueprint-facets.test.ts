import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

// The app import in TestSetup bootstraps OniItem from database-2024.json, so
// these tests use real prefabs and their real dlcIds (same fixtures as
// blueprint-dlcs.test.ts).
const AQUATIC_PREFAB = 'ReefGenerator'; // DLC5_ID
const FROSTY_PREFAB = 'Campfire'; // DLC2_ID
const AND_PREFAB = 'RoboPilotModule'; // EXPANSION1_ID + DLC3_ID (needs both)
const BASE_PREFAB = 'Tile'; // no DLC

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const blueprintData = (prefabIds: string[]) => ({
  blueprintItems: prefabIds.map((id, i) => ({
    id,
    temperature: 293.15,
    position: { x: i, y: 0 },
    elements: [],
  })),
});

// Every fixture in this file is named "Facet ..." so filterName scopes counts
// away from the seed database's own blueprints (TestDbHelper.seedDatabase),
// which otherwise inflate `total` and would need reproducing here to net out.
const SCOPE = { filterName: 'Facet' };

describe('Blueprint facet counts', function () {
  let authToken: string;
  let user2Token: string;
  let testData: any;

  const upload = (body: Record<string, unknown>, token = authToken) =>
    TestSetup.request()
      .post('/api/uploadblueprint')
      .set('Authorization', `Bearer ${token}`)
      .send({ thumbnail: TINY_PNG, publish: true, ...body });

  const facets = (query: Record<string, unknown> = {}, token?: string) => {
    const req = TestSetup.request()
      .get('/api/blueprintfacets')
      .query({ ...SCOPE, ...query });
    return token != null ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const facetsSecure = (query: Record<string, unknown>, token: string) =>
    TestSetup.request()
      .get('/api/blueprintfacetsSecure')
      .set('Authorization', `Bearer ${token}`)
      .query({ ...SCOPE, ...query });

  const list = (query: Record<string, unknown> = {}) =>
    TestSetup.request()
      .get('/api/getblueprints')
      .query({ olderthan: Date.now(), ...SCOPE, ...query });

  beforeEach(async function () {
    this.timeout(15000);
    testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
    user2Token = testData.users.user2.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/blueprintfacets', function () {
    let aquaticId: string;
    let baseId: string;

    beforeEach(async function () {
      this.timeout(15000);
      aquaticId = (
        await upload({ name: 'Facet Aquatic', blueprint: blueprintData([AQUATIC_PREFAB]), category: 'power' })
      ).body.id;
      await upload({ name: 'Facet Frosty', blueprint: blueprintData([FROSTY_PREFAB]), category: 'food' });
      baseId = (
        await upload({ name: 'Facet Base', blueprint: blueprintData([BASE_PREFAB]), category: 'power' })
      ).body.id;
      await upload({ name: 'Facet Both', blueprint: blueprintData([AND_PREFAB]), category: 'food' });
    });

    it('reports total, category, requiredDlcs and baseGame counts', async function () {
      const response = await facets();
      expect(response.status).to.equal(200);

      expect(response.body.total).to.equal(4);
      expect(response.body.category).to.deep.equal({ power: 2, food: 2 });
      expect(response.body.requiredDlcs.DLC5_ID).to.equal(1);
      expect(response.body.requiredDlcs.DLC2_ID).to.equal(1);
      // bothId needs two packs -> counted once under each, not once total.
      expect(response.body.requiredDlcs.EXPANSION1_ID).to.equal(1);
      expect(response.body.requiredDlcs.DLC3_ID).to.equal(1);
      expect(response.body.baseGame).to.equal(1);
    });

    it('self-excludes: selecting a DLC leaves every DLC count unchanged', async function () {
      const unfiltered = (await facets()).body.requiredDlcs;
      const filtered = (await facets({ dlc: 'DLC5_ID' })).body.requiredDlcs;
      expect(filtered).to.deep.equal(unfiltered);
    });

    it('shares one DLC count map: excludeDlc= does not move requiredDlcs counts either', async function () {
      const unfiltered = (await facets()).body.requiredDlcs;
      const filtered = (await facets({ excludeDlc: 'DLC5_ID' })).body.requiredDlcs;
      expect(filtered).to.deep.equal(unfiltered);
    });

    it('cross-dimension narrowing: category= moves the DLC counts', async function () {
      const response = await facets({ category: 'power' });
      expect(response.status).to.equal(200);
      // Only aquaticId + baseId are category=power.
      expect(response.body.requiredDlcs.DLC5_ID).to.equal(1);
      expect(response.body.requiredDlcs.DLC2_ID ?? 0).to.equal(0);
      expect(response.body.baseGame).to.equal(1);
    });

    it('baseGame counts requiredDlcs: [] and not never-derived docs', async function () {
      // baseId genuinely has requiredDlcs: [].
      const withBase = await BlueprintModel.model.findById(baseId);
      expect(withBase!.requiredDlcs).to.deep.equal([]);

      // Simulate a never-derived doc (field absent, not empty).
      await BlueprintModel.model.updateOne({ _id: aquaticId }, { $unset: { requiredDlcs: '' } });

      const response = await facets();
      expect(response.status).to.equal(200);
      // baseId still counts; the now-undefined aquaticId does not become a
      // second baseGame row, and it also drops out of requiredDlcs.DLC5_ID.
      expect(response.body.baseGame).to.equal(1);
      expect(response.body.requiredDlcs.DLC5_ID ?? 0).to.equal(0);
    });

    it('counts a blueprint needing two packs under each pack', async function () {
      const response = await facets();
      // bothId (RoboPilotModule) needs both EXPANSION1_ID and DLC3_ID — it
      // shows up once in each row, not split between them.
      expect(response.body.requiredDlcs.EXPANSION1_ID).to.equal(1);
      expect(response.body.requiredDlcs.DLC3_ID).to.equal(1);
    });

    it('rejects malformed params with the same 400s as getblueprints', async function () {
      expect((await facets({ category: 'not-a-category' })).status).to.equal(400);
      expect((await facets({ dlc: 'dlc3_id' })).status).to.equal(400);
      expect((await facets({ excludeDlc: ' , ' })).status).to.equal(400);
      expect((await facets({ rooms: 'not-a-room' })).status).to.equal(400);
      expect((await facets({ sort: 'not-a-sort' })).status).to.equal(400);
    });

    it('total agrees with the number of documents getblueprints returns unpaginated', async function () {
      const query = { category: 'food' };
      const facetsResponse = await facets(query);
      const listResponse = await list(query);

      expect(facetsResponse.status).to.equal(200);
      expect(listResponse.status).to.equal(200);
      expect(facetsResponse.body.total).to.equal(listResponse.body.blueprints.length);
    });

    it('sort/skip/olderthan are accepted but ignored — total is not paginated', async function () {
      const response = await facets({ sort: 'popular', skip: 1, olderthan: 1 });
      expect(response.status).to.equal(200);
      expect(response.body.total).to.equal(4);
    });
  });

  describe('draft visibility', function () {
    it('a draft counts for its owner (via the secure route) but not for a stranger', async function () {
      await upload({
        name: 'Facet Draft',
        blueprint: blueprintData([BASE_PREFAB]),
        publish: false,
      });
      await upload({ name: 'Facet Published', blueprint: blueprintData([BASE_PREFAB]) });

      const ownerId = testData.users.user1._id.toString();

      const ownerView = await facetsSecure({ filterUserId: ownerId }, authToken);
      expect(ownerView.status).to.equal(200);
      expect(ownerView.body.total).to.equal(2);

      const strangerView = await facetsSecure({ filterUserId: ownerId }, user2Token);
      expect(strangerView.status).to.equal(200);
      expect(strangerView.body.total).to.equal(1);

      // Anonymous (unauthenticated) requests get the same published-only view
      // as a stranger, regardless of filterUserId.
      const anonView = await facets({ filterUserId: ownerId });
      expect(anonView.status).to.equal(200);
      expect(anonView.body.total).to.equal(1);
    });
  });

  describe('GET /api/blueprintfacetsSecure', function () {
    it('requires authentication', async function () {
      const response = await TestSetup.request().get('/api/blueprintfacetsSecure');
      expect(response.status).to.equal(401);
    });

    it('behaves like the anonymous endpoint for a logged-in viewer browsing the public feed', async function () {
      await upload({ name: 'Facet Secure Base', blueprint: blueprintData([BASE_PREFAB]) });

      const anon = await facets();
      const secure = await facetsSecure({}, authToken);

      expect(secure.status).to.equal(200);
      expect(secure.body.total).to.equal(anon.body.total);
    });
  });

  describe('BLUEPRINT_FACETS_ENABLED kill switch', function () {
    const originalEnv = process.env.BLUEPRINT_FACETS_ENABLED;

    afterEach(function () {
      if (originalEnv === undefined) delete process.env.BLUEPRINT_FACETS_ENABLED;
      else process.env.BLUEPRINT_FACETS_ENABLED = originalEnv;
    });

    it('503s both endpoints without touching the database when disabled', async function () {
      process.env.BLUEPRINT_FACETS_ENABLED = 'false';

      expect((await facets()).status).to.equal(503);
      expect((await facetsSecure({}, authToken)).status).to.equal(503);
    });

    it('is enabled by default (unset)', async function () {
      delete process.env.BLUEPRINT_FACETS_ENABLED;
      expect((await facets()).status).to.equal(200);
    });

    it('treats any value other than the literal "false" as enabled', async function () {
      process.env.BLUEPRINT_FACETS_ENABLED = 'true';
      expect((await facets()).status).to.equal(200);
    });
  });
});
