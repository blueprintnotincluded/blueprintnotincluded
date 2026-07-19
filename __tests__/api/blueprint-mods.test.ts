import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { deriveMods } from '../../app/api/services/mod-derivation-service';

// The app import in TestSetup already bootstraps OniItem from database-2024.json
// (which includes the 24 native-provenance modded buildings), so these tests can
// reference real modded prefab ids directly.
const MOD_PREFAB_ID = 'PAirlockDoor';
const MOD_WORKSHOP_ID = '2094698134';

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

describe('Blueprint mod derivation', function () {
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

  describe('deriveMods service', function () {
    it('returns the sorted distinct mod ids for a known-mod building', function () {
      expect(deriveMods({ blueprintItems: [{ id: MOD_PREFAB_ID }] })).to.deep.equal([
        MOD_WORKSHOP_ID,
      ]);
    });

    it('returns [] for data without blueprintItems', function () {
      expect(deriveMods({})).to.deep.equal([]);
    });

    it('returns [] for garbage data', function () {
      expect(deriveMods('not an object')).to.deep.equal([]);
      expect(deriveMods(null)).to.deep.equal([]);
      expect(deriveMods(undefined)).to.deep.equal([]);
    });
  });

  describe('GET /api/mods', function () {
    it('returns 200 with a sorted mods index of the correct shape', async function () {
      const response = await TestSetup.request().get('/api/mods');

      expect(response.status).to.equal(200);
      expect(response.body.mods).to.be.an('array');
      const titles = response.body.mods.map((m: any) => m.title);
      expect(titles).to.deep.equal([...titles].sort((a, b) => a.localeCompare(b)));

      const airlockMod = response.body.mods.find((m: any) => m.id === MOD_WORKSHOP_ID);
      expect(airlockMod).to.exist;
      expect(airlockMod.buildings).to.include(MOD_PREFAB_ID);
    });
  });

  describe('save-path derivation', function () {
    it('derives mods and latches modded: true when a known-mod building is used', async function () {
      const response = await upload({
        name: 'Modded Save',
        blueprint: blueprintData([MOD_PREFAB_ID]),
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.mods).to.deep.equal([MOD_WORKSHOP_ID]);
      expect(saved!.modded).to.be.true;
    });

    it('derives mods: [] for a vanilla-only save', async function () {
      const response = await upload({
        name: 'Vanilla Save',
        blueprint: blueprintData(['Wire']),
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.mods).to.deep.equal([]);
    });

    it('ignores a client-supplied mods field', async function () {
      const response = await upload({
        name: 'Client Mods Ignored',
        blueprint: blueprintData(['Wire']),
        mods: [MOD_WORKSHOP_ID],
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.mods).to.deep.equal([]);
      expect(saved!.modded).to.not.be.true;
    });

    it('does not force modded: true from a client-supplied mods field alone', async function () {
      // metadata.modded defaults to null when omitted; the latch only fires
      // off the server-derived `mods`, never off client input.
      const response = await upload({
        name: 'Client Mods Ignored Modded Flag',
        blueprint: blueprintData(['Wire']),
        modded: false,
        mods: [MOD_WORKSHOP_ID],
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.modded).to.equal(false);
    });
  });

  describe('emit checks', function () {
    it('includes mods in the list payload', async function () {
      const created = await upload({
        name: 'List Emit Check',
        blueprint: blueprintData([MOD_PREFAB_ID]),
      });
      expect(created.status).to.equal(200);

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(list.status).to.equal(200);
      const item = list.body.blueprints.find((bp: any) => bp.id === created.body.id);
      expect(item).to.exist;
      expect(item.mods).to.deep.equal([MOD_WORKSHOP_ID]);
    });

    it('includes mods in the details payload', async function () {
      const created = await upload({
        name: 'Details Emit Check',
        blueprint: blueprintData([MOD_PREFAB_ID]),
      });
      expect(created.status).to.equal(200);

      const details = await TestSetup.request().get(`/api/blueprints/${created.body.id}`);

      expect(details.status).to.equal(200);
      expect(details.body.mods).to.deep.equal([MOD_WORKSHOP_ID]);
    });

    it('includes mods in the editor-open payload', async function () {
      const created = await upload({
        name: 'Editor Open Emit Check',
        blueprint: blueprintData([MOD_PREFAB_ID]),
      });
      expect(created.status).to.equal(200);

      const opened = await TestSetup.request()
        .get(`/api/getblueprint/${created.body.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(opened.status).to.equal(200);
      expect(opened.body.mods).to.deep.equal([MOD_WORKSHOP_ID]);
    });
  });
});
