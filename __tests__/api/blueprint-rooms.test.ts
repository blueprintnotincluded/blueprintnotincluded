import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { roomBlueprint } from '../helpers/roomFixtures';

// The app import in TestSetup already bootstraps OniItem from
// database-2024.json, so the room fixtures can build real blueprints here.
const LATRINE_DATA = () =>
  roomBlueprint(4, 3, [
    { id: 'Outhouse', x: 0, y: 0 },
    { id: 'WashBasin', x: 2, y: 0 },
  ]).toMdbBlueprint();

const BARRACKS_DATA = () => roomBlueprint(4, 3, [{ id: 'Bed', x: 0, y: 0 }]).toMdbBlueprint();

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Blueprint rooms derivation API', function () {
  let authToken: string;
  let testData: any;

  const upload = (body: Record<string, unknown>) =>
    TestSetup.request()
      .post('/api/uploadblueprint')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ thumbnail: TINY_PNG, publish: true, ...body });

  beforeEach(async function () {
    this.timeout(15000);
    testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('save-path derivation', function () {
    it('derives rooms from the uploaded content', async function () {
      const response = await upload({ name: 'Latrine Base', blueprint: LATRINE_DATA() });
      expect(response.status).to.equal(200);

      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.rooms).to.deep.equal(['latrine']);
    });

    it('re-derives on overwrite', async function () {
      const first = await upload({ name: 'Evolving Base', blueprint: LATRINE_DATA() });
      expect(first.status).to.equal(200);

      const second = await upload({
        name: 'Evolving Base',
        blueprint: BARRACKS_DATA(),
        overwrite: true,
      });
      expect(second.status).to.equal(200);

      const saved = await BlueprintModel.model.findById(second.body.id);
      expect(saved!.rooms).to.deep.equal(['barracks']);
    });

    it('ignores a client-supplied rooms value', async function () {
      const response = await upload({
        name: 'Sneaky Base',
        blueprint: BARRACKS_DATA(),
        rooms: ['hospital', 'greatHall'],
      });
      expect(response.status).to.equal(200);

      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.rooms).to.deep.equal(['barracks']);
    });

    it('stores [] for a blueprint with no rooms and null for unparseable data', async function () {
      const empty = await upload({ name: 'Empty Base', blueprint: { blueprintItems: [] } });
      expect(empty.status).to.equal(200);
      const emptySaved = await BlueprintModel.model.findById(empty.body.id);
      expect(emptySaved!.rooms).to.deep.equal([]);

      // Legacy/foreign payload shape without blueprintItems: not derivable.
      const legacy = await upload({ name: 'Legacy Base', blueprint: { buildings: [] } });
      expect(legacy.status).to.equal(200);
      const legacySaved = await BlueprintModel.model.findById(legacy.body.id);
      expect(legacySaved!.rooms).to.equal(null);
    });
  });

  describe('GET /api/getblueprints?rooms=', function () {
    let latrineId: string;
    let barracksId: string;

    beforeEach(async function () {
      this.timeout(15000);
      latrineId = (await upload({ name: 'Latrine Base', blueprint: LATRINE_DATA() })).body.id;
      barracksId = (await upload({ name: 'Barracks Base', blueprint: BARRACKS_DATA() })).body.id;
    });

    const list = (query: Record<string, unknown>) =>
      TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), ...query });

    it('filters by a single room type', async function () {
      const response = await list({ rooms: 'latrine' });
      expect(response.status).to.equal(200);

      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.include(latrineId);
      expect(ids).to.not.include(barracksId);
    });

    it('matches any of a comma-separated list', async function () {
      const response = await list({ rooms: 'latrine,barracks' });
      expect(response.status).to.equal(200);

      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.include(latrineId);
      expect(ids).to.include(barracksId);
    });

    it('exposes rooms on list items', async function () {
      const response = await list({});
      const item = response.body.blueprints.find((bp: any) => bp.id === latrineId);
      expect(item.rooms).to.deep.equal(['latrine']);
    });

    it('does not match blueprints whose rooms were never derived', async function () {
      // Seeded fixtures predate room derivation (no rooms field).
      const response = await list({ rooms: 'latrine' });
      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.deep.equal([latrineId]);
    });

    it('rejects unknown room types with 400', async function () {
      const response = await list({ rooms: 'latrine,notaroom' });
      expect(response.status).to.equal(400);
    });

    it('rejects an empty rooms value with 400', async function () {
      const response = await list({ rooms: ' , ' });
      expect(response.status).to.equal(400);
    });
  });

  describe('version restore', function () {
    it('re-derives rooms from the restored data', async function () {
      this.timeout(15000);
      const id = (await upload({ name: 'Versioned Base', blueprint: LATRINE_DATA() })).body.id;

      // Snapshot the latrine state, then overwrite with barracks content.
      const snapshot = (
        await TestSetup.request()
          .post(`/api/blueprints/${id}/versions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'latrine snapshot' })
      ).body.version;

      await upload({ name: 'Versioned Base', blueprint: BARRACKS_DATA(), overwrite: true });
      let saved = await BlueprintModel.model.findById(id);
      expect(saved!.rooms).to.deep.equal(['barracks']);

      // Restoring an earlier version must re-derive from that version's data.
      const versions = (
        await TestSetup.request().get(`/api/blueprints/${id}/versions`)
      ).body.versions;
      const earlier = versions.find((v: any) => v.id !== snapshot.id) ?? snapshot;

      const restore = await TestSetup.request()
        .post(`/api/blueprints/${id}/versions/${earlier.id}/restore`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(restore.status).to.equal(200);

      saved = await BlueprintModel.model.findById(id);
      expect(saved!.rooms).to.deep.equal(['latrine']);
    });
  });
});
