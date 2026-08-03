import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import { Types } from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup, TestDbHelper } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { BlueprintSearchModel } from '../../app/api/models/blueprint-search';
import { deriveSearchRow } from '../../app/api/services/search-index-service';
import { searchBlueprintIds } from '../../app/api/services/search-service';
import { getSearchTermDictionary } from '../../app/api/services/search-term-dictionary';

// Search over blueprintsearch rows (spec/multilingual-search-plan.md Phases
// 0-1): derivation, retrieval/fusion/ranking, and the getblueprints
// integration incl. the SEARCH_V2_ENABLED kill switch. No network anywhere.

describe('Search (blueprintsearch)', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(10000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    delete process.env.SEARCH_V2_ENABLED;
    await TestSetup.afterEach();
  });

  function bpData(prefabIds: string[]) {
    return {
      blueprintItems: prefabIds.map((id, i) => ({ id, position: [i, 0] })),
    };
  }

  describe('term dictionary', function () {
    it('maps building display names and prefab ids to ids', function () {
      const dictionary = getSearchTermDictionary();
      expect(dictionary.byId['WaterPurifier']).to.equal('Water Sieve');
      expect(dictionary.byTerm['water sieve']).to.include('WaterPurifier');
      expect(dictionary.byTerm['waterpurifier']).to.include('WaterPurifier');
    });

    it('includes community jargon from the alias file', function () {
      const dictionary = getSearchTermDictionary();
      expect(dictionary.byTerm['spom']).to.include('Electrolyzer');
      expect(dictionary.byTerm['aquatuner']).to.include('LiquidConditioner');
    });

    it('includes room type names', function () {
      const dictionary = getSearchTermDictionary();
      expect(dictionary.byId['greatHall']).to.equal('Great Hall');
      expect(dictionary.byTerm['great hall']).to.include('greatHall');
    });
  });

  describe('deriveSearchRow', function () {
    it('derives title, terms and termIds from the blueprint content', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'My Water Setup',
        data: bpData(['WaterPurifier', 'LiquidPump', 'WaterPurifier']),
      });
      await BlueprintModel.model.updateOne({ _id: doc._id }, { $set: { rooms: ['latrine'] } });
      const fresh = await BlueprintModel.model.findById(doc._id);

      const row = deriveSearchRow(fresh!);
      expect(row.lang).to.equal('en');
      expect(row.title).to.equal('My Water Setup');
      expect(row.termIds).to.deep.equal(['LiquidPump', 'WaterPurifier', 'latrine']);
      expect(row.terms).to.include('Water Sieve');
      expect(row.terms).to.include('Latrine');
      expect(row.isPublished).to.equal(true);
      expect(row.sourceHash).to.have.length(16);
    });

    it('excludes editor annotations from termIds and never throws on bad data', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Annotated',
        data: { blueprintItems: [{ id: 'Element' }, { id: 'Info' }, { id: 'Generator' }] },
      });
      const row = deriveSearchRow((await BlueprintModel.model.findById(doc._id))!);
      expect(row.termIds).to.deep.equal(['Generator']);

      const broken = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Broken',
        data: null,
      });
      const brokenRow = deriveSearchRow((await BlueprintModel.model.findById(broken._id))!);
      expect(brokenRow.termIds).to.deep.equal([]);
    });
  });

  describe('searchBlueprintIds', function () {
    it('returns [] for an empty or punctuation-only query', async function () {
      expect(await searchBlueprintIds('')).to.deep.equal([]);
      expect(await searchBlueprintIds('!!! ...')).to.deep.equal([]);
    });

    it('ranks an exact title match above a term-only match', async function () {
      const titled = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Water Sieve Loop',
        data: bpData(['LiquidPump']),
      });
      const termOnly = await TestDbHelper.createTestBlueprint(testData.users.user2._id, {
        name: 'Cooling Block',
        data: bpData(['WaterPurifier']),
      });

      const ids = (await searchBlueprintIds('water sieve')).map(id => id.toString());
      expect(ids).to.include((titled._id as Types.ObjectId).toString());
      expect(ids).to.include((termOnly._id as Types.ObjectId).toString());
      expect(ids.indexOf((titled._id as Types.ObjectId).toString())).to.be.lessThan(
        ids.indexOf((termOnly._id as Types.ObjectId).toString())
      );
    });

    it('finds a description-less blueprint by community jargon (structural backbone)', async function () {
      const spom = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Untitled 47',
        data: bpData(['Electrolyzer', 'GasPump']),
      });

      const ids = (await searchBlueprintIds('spom')).map(id => id.toString());
      expect(ids).to.include((spom._id as Types.ObjectId).toString());
    });

    it('a query that resolves nothing and matches no text returns []', async function () {
      const ids = await searchBlueprintIds('zzzqqqxxx unmatched');
      expect(ids).to.deep.equal([]);
    });
  });

  describe('GET /api/getblueprints?filterName= (search v2)', function () {
    it('serves relevance-ordered search results', async function () {
      const titled = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Water Sieve Loop',
        data: bpData(['LiquidPump']),
      });
      const termOnly = await TestDbHelper.createTestBlueprint(testData.users.user2._id, {
        name: 'Cooling Block',
        data: bpData(['WaterPurifier']),
      });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'water sieve' });

      expect(response.status).to.equal(200);
      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.include((titled._id as Types.ObjectId).toString());
      expect(ids).to.include((termOnly._id as Types.ObjectId).toString());
      expect(ids.indexOf((titled._id as Types.ObjectId).toString())).to.be.lessThan(
        ids.indexOf((termOnly._id as Types.ObjectId).toString())
      );
    });

    it('paginates search results by skip offset over the ranked order', async function () {
      const first = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ filterName: 'coal generator', skip: 0 });
      expect(first.status).to.equal(200);
      const page1 = first.body.blueprints.map((bp: any) => bp.id);
      expect(page1.length).to.be.greaterThan(0);

      const shifted = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ filterName: 'coal generator', skip: 1 });
      expect(shifted.status).to.equal(200);
      const page2 = shifted.body.blueprints.map((bp: any) => bp.id);
      // All matches fit in one window, so offset 1 is exactly page 1 minus
      // its top-ranked result, in the same order.
      expect(page2).to.deep.equal(page1.slice(1));
    });

    it('never leaks drafts or deleted blueprints even when search rows are stale', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Stale Sieve Draft',
        data: bpData(['WaterPurifier']),
      });
      // Make the blueprint a draft WITHOUT updating its search row — the
      // authoritative filter must still exclude it.
      await BlueprintModel.model.updateOne({ _id: doc._id }, { $set: { isPublished: false } });
      const rowStillPublished = await BlueprintSearchModel.model.findOne({ blueprintId: doc._id });
      expect(rowStillPublished!.isPublished).to.equal(true);

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'stale sieve draft' });
      expect(response.status).to.equal(200);
      expect(response.body.blueprints.map((bp: any) => bp.id)).to.not.include(
        (doc._id as Types.ObjectId).toString()
      );
    });

    it('SEARCH_V2_ENABLED=false falls back to the legacy substring match', async function () {
      process.env.SEARCH_V2_ENABLED = 'false';
      // Legacy behavior: 'oxygen(' is a literal substring and matches nothing
      const legacy = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'oxygen(' });
      expect(legacy.status).to.equal(200);
      expect(legacy.body.blueprints).to.deep.equal([]);

      const substring = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'oxygen' });
      expect(substring.body.blueprints.map((bp: any) => bp.name)).to.include('Oxygen Production Line');
    });
  });

  describe('duplicate collapse (§2.5)', function () {
    // The measured failure mode: one build saved into 86 accounts, burying
    // every other match. Same content in each copy => same cluster key.
    async function saveCopies(names: string[]) {
      const docs = [];
      for (const [index, name] of names.entries()) {
        const owner = index % 2 === 0 ? testData.users.user1._id : testData.users.user2._id;
        docs.push(
          await TestDbHelper.createTestBlueprint(owner, {
            name,
            data: {
              blueprintItems: [
                { id: 'Electrolyzer', position: { x: 0, y: 0 } },
                { id: 'GasPump', position: { x: 2, y: 1 }, orientation: 1 },
              ],
            },
          })
        );
      }
      return docs;
    }

    it('derives one cluster key for identical content and another for different content', async function () {
      const [copyA, copyB] = await saveCopies(['Ranch Alpha', 'Ranch Beta']);
      const other = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Ranch Gamma',
        data: { blueprintItems: [{ id: 'Electrolyzer', position: { x: 0, y: 0 } }] },
      });

      const rowA = await BlueprintSearchModel.model.findOne({ blueprintId: copyA._id });
      const rowB = await BlueprintSearchModel.model.findOne({ blueprintId: copyB._id });
      const rowOther = await BlueprintSearchModel.model.findOne({ blueprintId: other._id });
      expect(rowA!.clusterKey).to.be.a('string');
      expect(rowB!.clusterKey).to.equal(rowA!.clusterKey);
      expect(rowOther!.clusterKey).to.not.equal(rowA!.clusterKey);
    });

    it('collapses identical copies to one result and reports how many it stands for', async function () {
      const copies = await saveCopies(['Ranch Copy One', 'Ranch Copy Two', 'Ranch Copy Three']);
      const copyIds = copies.map(doc => (doc._id as Types.ObjectId).toString());

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'ranch copy' });
      expect(response.status).to.equal(200);

      const returned = response.body.blueprints.filter((bp: any) => copyIds.includes(bp.id));
      expect(returned).to.have.length(1);
      expect(returned[0].duplicateCount).to.equal(2);
    });

    it('collapse=false returns every copy, uncollapsed', async function () {
      const copies = await saveCopies(['Ranch Full One', 'Ranch Full Two', 'Ranch Full Three']);
      const copyIds = copies.map(doc => (doc._id as Types.ObjectId).toString());

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'ranch full', collapse: 'false' });
      expect(response.status).to.equal(200);

      const returned = response.body.blueprints.filter((bp: any) => copyIds.includes(bp.id));
      expect(returned).to.have.length(3);
      expect(returned.every((bp: any) => bp.duplicateCount === 0)).to.equal(true);
    });

    it('rejects a non-boolean collapse param', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ filterName: 'ranch', collapse: 'sometimes' });
      expect(response.status).to.equal(400);
    });

    it('never collapses a visible copy behind a hidden canonical', async function () {
      const copies = await saveCopies(['Ranch Hidden One', 'Ranch Hidden Two']);
      const visibleId = (copies[1]._id as Types.ObjectId).toString();
      // Make the first copy (earliest createdAt, so the elected canonical) a
      // draft. The visible copy must still be the result, not a hole.
      await BlueprintModel.model.updateOne({ _id: copies[0]._id }, { $set: { isPublished: false } });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'ranch hidden' });
      expect(response.status).to.equal(200);

      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.include(visibleId);
      expect(ids).to.not.include((copies[0]._id as Types.ObjectId).toString());
      const returned = response.body.blueprints.find((bp: any) => bp.id === visibleId);
      expect(returned.duplicateCount).to.equal(0);
    });

    it('leaves distinct builds alone', async function () {
      const first = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Distinct Sieve Build',
        data: { blueprintItems: [{ id: 'WaterPurifier', position: { x: 0, y: 0 } }] },
      });
      const second = await TestDbHelper.createTestBlueprint(testData.users.user2._id, {
        name: 'Distinct Sieve Rig',
        data: {
          blueprintItems: [
            { id: 'WaterPurifier', position: { x: 0, y: 0 } },
            { id: 'LiquidPump', position: { x: 3, y: 0 } },
          ],
        },
      });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), filterName: 'distinct sieve' });
      const ids = response.body.blueprints.map((bp: any) => bp.id);
      expect(ids).to.include((first._id as Types.ObjectId).toString());
      expect(ids).to.include((second._id as Types.ObjectId).toString());
    });
  });

  describe('write-path search row sync', function () {
    it('soft delete patches the search row status', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Doomed Blueprint',
        data: bpData(['Generator']),
      });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ blueprintId: (doc._id as Types.ObjectId).toString() });
      expect(response.status).to.equal(200);

      // Fire-and-forget: poll briefly for the async status patch
      let row = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        row = await BlueprintSearchModel.model.findOne({ blueprintId: doc._id });
        if (row?.deletedAt != null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      // An actual Date, not merely "not null" — undefined must fail too if
      // the sync never landed before the poll gave up.
      expect(row!.deletedAt).to.be.an.instanceOf(Date);
    });
  });
});
