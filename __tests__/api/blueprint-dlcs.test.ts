import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { deriveDlcs } from '../../app/api/services/dlc-derivation-service';

// The app import in TestSetup bootstraps OniItem from database-2024.json, so
// these tests use real prefabs and their real dlcIds.
const AQUATIC_PREFAB = 'ReefGenerator'; // DLC5_ID
const FROSTY_PREFAB = 'Campfire'; // DLC2_ID
const BIONIC_PREFAB = 'GunkEmptier'; // DLC3_ID
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

describe('Blueprint DLC requirement derivation', function () {
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

  describe('deriveDlcs service', function () {
    // The bug that motivated the whole change: DLC5_ID was mapped to the
    // GameVersion 'bionicBooster', so an Aquatic Planet Pack blueprint claimed
    // to need Bionic content. Raw ids can't be mislabelled this way.
    it('reports the aquatic pack — and nothing bionic — for a ReefGenerator', function () {
      const required = deriveDlcs(blueprintData([AQUATIC_PREFAB]));
      expect(required).to.deep.equal(['DLC5_ID']);
      expect(required).to.not.include('DLC3_ID');
    });

    it('reports [] for a base-game-only blueprint', function () {
      expect(deriveDlcs(blueprintData([BASE_PREFAB]))).to.deep.equal([]);
    });

    // What the old single-valued gameVersion could not express: owning one pack
    // implies nothing about the other, so both must be reported.
    it('reports both packs for a blueprint mixing two of them', function () {
      expect(deriveDlcs(blueprintData([AQUATIC_PREFAB, FROSTY_PREFAB]))).to.deep.equal([
        'DLC2_ID',
        'DLC5_ID',
      ]);
    });

    it('keeps both ids of a building that needs two DLCs at once', function () {
      expect(deriveDlcs(blueprintData([AND_PREFAB]))).to.deep.equal(['DLC3_ID', 'EXPANSION1_ID']);
    });

    it('dedupes repeated buildings and sorts independently of placement order', function () {
      const a = deriveDlcs(blueprintData([BIONIC_PREFAB, FROSTY_PREFAB, BIONIC_PREFAB]));
      const b = deriveDlcs(blueprintData([FROSTY_PREFAB, BIONIC_PREFAB]));
      expect(a).to.deep.equal(['DLC2_ID', 'DLC3_ID']);
      expect(a).to.deep.equal(b);
    });

    it('ignores buildings the database has never heard of', function () {
      expect(deriveDlcs(blueprintData(['NotARealPrefabId']))).to.deep.equal([]);
    });

    it('returns [] for data without blueprintItems', function () {
      expect(deriveDlcs({})).to.deep.equal([]);
    });

    it('returns [] for garbage data', function () {
      expect(deriveDlcs('not an object')).to.deep.equal([]);
      expect(deriveDlcs(null)).to.deep.equal([]);
      expect(deriveDlcs(undefined)).to.deep.equal([]);
    });
  });

  describe('save-path derivation', function () {
    it('stores requiredDlcs on save', async function () {
      const response = await upload({
        name: 'Aquatic Save',
        blueprint: blueprintData([AQUATIC_PREFAB, FROSTY_PREFAB]),
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.requiredDlcs).to.deep.equal(['DLC2_ID', 'DLC5_ID']);
    });

    it('stores [] for a base-game-only save', async function () {
      const response = await upload({
        name: 'Base Game Save',
        blueprint: blueprintData([BASE_PREFAB]),
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.requiredDlcs).to.deep.equal([]);
    });

    // Requirements come from the blueprint's content, never from the client
    // (or from what the author happens to own) — same policy as rooms/mods.
    it('ignores a client-supplied requiredDlcs field', async function () {
      const response = await upload({
        name: 'Client Dlcs Ignored',
        blueprint: blueprintData([BASE_PREFAB]),
        requiredDlcs: ['DLC3_ID'],
      });

      expect(response.status).to.equal(200);
      const saved = await BlueprintModel.model.findById(response.body.id);
      expect(saved!.requiredDlcs).to.deep.equal([]);
    });
  });

  describe('emit checks', function () {
    it('includes requiredDlcs in the list payload', async function () {
      const created = await upload({
        name: 'Dlc List Emit Check',
        blueprint: blueprintData([AQUATIC_PREFAB]),
      });
      expect(created.status).to.equal(200);

      const list = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(list.status).to.equal(200);
      const item = list.body.blueprints.find((bp: any) => bp.id === created.body.id);
      expect(item).to.exist;
      expect(item.requiredDlcs).to.deep.equal(['DLC5_ID']);
    });

    it('includes requiredDlcs in the details payload', async function () {
      const created = await upload({
        name: 'Dlc Details Emit Check',
        blueprint: blueprintData([AND_PREFAB]),
      });
      expect(created.status).to.equal(200);

      const details = await TestSetup.request().get(`/api/blueprints/${created.body.id}`);

      expect(details.status).to.equal(200);
      expect(details.body.requiredDlcs).to.deep.equal(['DLC3_ID', 'EXPANSION1_ID']);
    });

    it('includes requiredDlcs in the editor-open payload', async function () {
      const created = await upload({
        name: 'Dlc Editor Open Emit Check',
        blueprint: blueprintData([FROSTY_PREFAB]),
      });
      expect(created.status).to.equal(200);

      const opened = await TestSetup.request()
        .get(`/api/getblueprint/${created.body.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(opened.status).to.equal(200);
      expect(opened.body.requiredDlcs).to.deep.equal(['DLC2_ID']);
    });

    it('emits [] for a blueprint saved before the field existed', async function () {
      const created = await upload({
        name: 'Legacy Dlc Doc',
        blueprint: blueprintData([AQUATIC_PREFAB]),
      });
      expect(created.status).to.equal(200);
      // Simulate a document written before requiredDlcs existed: the field is
      // absent, not empty (see the model's default: undefined).
      await BlueprintModel.model.updateOne(
        { _id: created.body.id },
        { $unset: { requiredDlcs: '' } }
      );

      const details = await TestSetup.request().get(`/api/blueprints/${created.body.id}`);

      expect(details.status).to.equal(200);
      expect(details.body.requiredDlcs).to.deep.equal([]);
    });
  });
});
