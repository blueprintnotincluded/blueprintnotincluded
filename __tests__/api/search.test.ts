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
import {
  deriveNativeSearchRow,
  deriveSearchRow,
  deriveSearchRowWithTranslation,
  upsertSearchRow,
} from '../../app/api/services/search-index-service';
import { searchBlueprintIds, searchBlueprints } from '../../app/api/services/search-service';
import { getSearchTermDictionary } from '../../app/api/services/search-term-dictionary';
import { TranslationService } from '../../app/api/services/translation-service';
import { TranslationProvider } from '../../app/api/services/translation-provider';
import { TranslationUnitModel } from '../../app/api/models/translation-unit';
import { TranslationBudgetModel } from '../../app/api/models/translation-budget';
import { SearchQueryModel } from '../../app/api/models/search-query';
import { FakeTranslationProvider } from '../helpers/fake-translation-provider';
import { VietnameseTitleTranslationService } from '../../app/api/services/vietnamese-title-translation-service';
import { VietnameseTitleProvider } from '../../app/api/services/gemini-vietnamese-title-provider';

// Search over blueprintsearch rows (spec/multilingual-search-plan.md Phases
// 0-1): derivation, retrieval/fusion/ranking, and the getblueprints
// integration incl. the SEARCH_V2_ENABLED kill switch. No network anywhere —
// phase 3b's title-translation pivot below uses the fake provider, same
// no-network policy as translation-service.test.ts.

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
      expect(substring.body.blueprints.map((bp: any) => bp.name)).to.include(
        'Oxygen Production Line'
      );
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

    it('collapses under an explicit count sort too, not just relevance order', async function () {
      // The site's default sort is trending, so a collapse that only covered
      // the relevance path would never fire in the actual UI.
      const copies = await saveCopies([
        'Ranch Sorted One',
        'Ranch Sorted Two',
        'Ranch Sorted Three',
      ]);
      const copyIds = copies.map(doc => (doc._id as Types.ObjectId).toString());

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ filterName: 'ranch sorted', sort: 'trending' });
      expect(response.status).to.equal(200);

      const returned = response.body.blueprints.filter((bp: any) => copyIds.includes(bp.id));
      expect(returned).to.have.length(1);
      expect(returned[0].duplicateCount).to.equal(2);
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
      await BlueprintModel.model.updateOne(
        { _id: copies[0]._id },
        { $set: { isPublished: false } }
      );

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

    it('saves a non-ASCII title through the upload endpoint and finds it again', async function () {
      // End-to-end for the phase-3a name relaxation: a Vietnamese title is
      // storable (it was a 400 before), its search row is derived on save, and
      // it is retrievable by a query typed in either Unicode normalization —
      // normalizeText applies NFC on both sides, and the stored title is
      // canonical, so the two can never disagree.
      const token = testData.users.user1.generateJwt();
      const title = 'M\u00e1y l\u1ecdc n\u01b0\u1edbc'; // "water filter", composed
      const decomposedQuery = 'ma\u0301y lo\u0323c'; // same words, decomposed

      const saved = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: title,
          blueprint: bpData(['WaterPurifier']),
          thumbnail: 'base64thumbnail',
          publish: true,
        });
      expect(saved.status).to.equal(200);

      const row = await BlueprintSearchModel.model.findOne({ blueprintId: saved.body.id });
      expect(row!.title).to.equal(title);

      for (const query of [title, decomposedQuery]) {
        const response = await TestSetup.request()
          .get('/api/getblueprints')
          .query({ filterName: query });
        expect(response.status, query).to.equal(200);
        expect(
          response.body.blueprints.map((bp: any) => bp.id),
          query
        ).to.include(saved.body.id);
      }
    });
  });

  describe('title translation pivot (phase 3b)', function () {
    let fake: FakeTranslationProvider;

    beforeEach(async function () {
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      fake = new FakeTranslationProvider();
      TranslationService.setInstanceForTest(new TranslationService(fake));
    });

    afterEach(async function () {
      TranslationService.setInstanceForTest(null);
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
    });

    it('translates a confidently non-English title into the en row', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('machine');
      expect(fields.title).to.equal('[en] Máy lọc nước');
      expect(fake.calls).to.have.length(1);
    });

    it('makes no provider call for an English title — sourceHash is unaffected either way', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Cooling Loop System For My Base',
        data: bpData(['WaterPurifier']),
      });

      const base = deriveSearchRow(doc);
      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('authored');
      expect(fields.title).to.equal('Cooling Loop System For My Base');
      expect(fields.sourceHash).to.equal(base.sourceHash);
      expect(fake.calls).to.have.length(0);
    });

    it('leaves the title untranslated when the provider is not configured (prod default)', async function () {
      fake.configured = false;
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('authored');
      expect(fields.title).to.equal('Máy lọc nước');
      expect(fake.calls).to.have.length(0);
    });

    it('degrades to the untranslated title when the provider fails', async function () {
      fake.failNext = true;
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('authored');
      expect(fields.title).to.equal('Máy lọc nước');
    });

    it('end to end: a real non-English title becomes searchable in English', async function () {
      // A real (test-only) provider that actually returns English text, so
      // this proves the deliverable — not just that some string was
      // returned — an English query finds a blueprint titled in Vietnamese.
      const englishProvider: TranslationProvider = {
        isConfigured: () => true,
        translate: async texts =>
          texts.map(() => ({ text: 'Water Filter Farm', detectedSourceLang: 'vi' })),
      };
      TranslationService.setInstanceForTest(new TranslationService(englishProvider));

      const token = testData.users.user1.generateJwt();
      const saved = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Máy lọc nước',
          blueprint: bpData(['WaterPurifier']),
          thumbnail: 'base64thumbnail',
          publish: true,
        });
      expect(saved.status).to.equal(200);

      const savedBlueprint = await BlueprintModel.model.findById(saved.body.id);
      expect(savedBlueprint!.sourceLang).to.equal('vi');

      // Fire-and-forget: poll briefly for the async machine-title patch.
      let row = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        row = await BlueprintSearchModel.model.findOne({ blueprintId: saved.body.id });
        if (row?.origin === 'machine') break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(row!.origin).to.equal('machine');
      expect(row!.title).to.equal('Water Filter Farm');

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ filterName: 'water filter' });
      expect(response.status).to.equal(200);
      expect(response.body.blueprints.map((bp: any) => bp.id)).to.include(saved.body.id);
    });
  });

  // spec/search-followups.md Part 1 §1. Translating a title used to DELETE the
  // authored text from the index; titleOriginal keeps it, so a translation can
  // only ever add a match.
  describe('titleOriginal (Part 1 §1)', function () {
    let fake: FakeTranslationProvider;

    beforeEach(async function () {
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      fake = new FakeTranslationProvider();
      TranslationService.setInstanceForTest(new TranslationService(fake));
    });

    afterEach(async function () {
      TranslationService.setInstanceForTest(null);
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
    });

    it('is null on an authored row, where it would only duplicate title', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Cooling Loop System For My Base',
        data: bpData(['WaterPurifier']),
      });
      expect(deriveSearchRow(doc).titleOriginal).to.equal(null);
    });

    it('holds the authored title once the row flips to machine', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('machine');
      expect(fields.title).to.equal('[en] Máy lọc nước');
      expect(fields.titleOriginal).to.equal('Máy lọc nước');
    });

    // The actual deliverable: the blueprint stays findable by the words its
    // author typed, even though the indexed title is now English.
    it('keeps a translated blueprint findable by its authored title', async function () {
      const englishProvider: TranslationProvider = {
        isConfigured: () => true,
        translate: async texts =>
          texts.map(() => ({ text: 'Strategic cooking', detectedSourceLang: 'pt' })),
      };
      TranslationService.setInstanceForTest(new TranslationService(englishProvider));

      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Cozinha estrategia em choque',
        data: bpData(['WaterPurifier']),
        isPublished: true,
      });
      const fields = await deriveSearchRowWithTranslation(doc, null);
      await BlueprintSearchModel.model.updateOne(
        { blueprintId: doc._id, lang: 'en' },
        {
          $set: { title: fields.title, titleOriginal: fields.titleOriginal, origin: fields.origin },
        }
      );

      const id = (doc._id as Types.ObjectId).toString();

      // Both forms hit the same row.
      const english = await searchBlueprintIds('strategic cooking');
      expect(english.map(String)).to.include(id);

      const authored = await searchBlueprintIds('cozinha estrategia');
      expect(authored.map(String)).to.include(id);
    });

    // Derived wholesale on every full derivation, so it cannot accumulate —
    // the objection that ruled out putting the authored text in terms[].
    it('is cleared when a re-derivation resets the row to authored', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });
      const translated = await deriveSearchRowWithTranslation(doc, null);
      expect(translated.titleOriginal).to.not.equal(null);

      doc.name = 'Water Sieve Setup For My Base';
      expect(deriveSearchRow(doc).titleOriginal).to.equal(null);
    });
  });

  // spec/search-followups.md §2.9 — resolves open decision #1 in the main
  // plan. Once sourceLang is known, a second row holding the AUTHORED text
  // verbatim under its own lang is free: no provider call, just a write.
  // Distinct from titleOriginal: that field lives on the 'en' pivot with the
  // pivot's own textLang, so a Russian title stemmed as English gets no real
  // stemming benefit from it; this row gets Mongo's real per-language
  // stemmer via language_override.
  describe('native-language rows (§2.9)', function () {
    describe('deriveNativeSearchRow', function () {
      it('returns null when sourceLang was never set', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'No Locale Base',
          data: bpData(['Ladder']),
        });
        expect(deriveNativeSearchRow(doc)).to.equal(null);
      });

      it('returns null when sourceLang is en — the pivot already covers it', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'English Base',
          data: bpData(['Ladder']),
        });
        doc.sourceLang = 'en';
        expect(deriveNativeSearchRow(doc)).to.equal(null);
      });

      it('holds the authored text verbatim, never a titleOriginal, under its own lang', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'Máy lọc nước',
          data: bpData(['WaterPurifier']),
        });
        doc.sourceLang = 'vi';

        const native = deriveNativeSearchRow(doc);
        expect(native).to.not.equal(null);
        expect(native!.lang).to.equal('vi');
        expect(native!.title).to.equal('Máy lọc nước');
        expect(native!.origin).to.equal('authored');
        expect(native!.titleOriginal).to.equal(null);
        // termIds/clusterKey are language-independent — same content as the
        // pivot, just filed under a different lang for its own stemming.
        const pivot = deriveSearchRow(doc);
        expect(native!.termIds).to.deep.equal(pivot.termIds);
        expect(native!.clusterKey).to.equal(pivot.clusterKey);
      });
    });

    describe('upsertSearchRow writes and prunes the native row', function () {
      it('writes a native row alongside the en pivot when sourceLang is declared', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'Máy lọc nước hai',
          data: bpData(['WaterPurifier']),
        });
        doc.sourceLang = 'vi';
        await upsertSearchRow(doc);

        const rows = await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean();
        const langs = rows.map(r => r.lang).sort();
        expect(langs).to.deep.equal(['en', 'vi']);
        const native = rows.find(r => r.lang === 'vi')!;
        expect(native.origin).to.equal('authored');
        expect(native.title).to.equal('Máy lọc nước hai');
      });

      it('prunes the old native row when sourceLang moves to a different language', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'Título Original',
          data: bpData(['WaterPurifier']),
        });
        doc.sourceLang = 'pt';
        await upsertSearchRow(doc);
        expect(
          (await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean())
            .map(r => r.lang)
            .sort()
        ).to.deep.equal(['en', 'pt']);

        // The title was re-authored in a different language.
        doc.name = 'Máy lọc nước ba';
        doc.sourceLang = 'vi';
        await upsertSearchRow(doc);

        const rows = await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean();
        expect(rows.map(r => r.lang).sort()).to.deep.equal(['en', 'vi']);
      });

      it('prunes the native row entirely when sourceLang reverts to English/unknown', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'Máy lọc nước bon',
          data: bpData(['WaterPurifier']),
        });
        doc.sourceLang = 'vi';
        await upsertSearchRow(doc);
        expect(
          await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean()
        ).to.have.length(2);

        doc.name = 'Now An English Title';
        doc.sourceLang = 'en';
        await upsertSearchRow(doc);

        const rows = await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean();
        expect(rows.map(r => r.lang)).to.deep.equal(['en']);
      });

      it('never touches a phase-5 accreted machine row in some other language', async function () {
        const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
          name: 'Máy lọc nước bon',
          data: bpData(['WaterPurifier']),
        });
        doc.sourceLang = 'vi';
        await upsertSearchRow(doc);

        // Simulate a reader having JIT-translated this blueprint into
        // Russian (phase 5) — origin 'machine', unrelated to sourceLang.
        await BlueprintSearchModel.model.create({
          blueprintId: doc._id,
          lang: 'ru',
          textLang: 'ru',
          origin: 'machine',
          title: 'Русский заголовок',
          titleOriginal: null,
          description: '',
          terms: [],
          termIds: [],
          clusterKey: null,
          sourceHash: 'accreted-ru-hash',
          isPublished: true,
          deletedAt: null,
        });

        // sourceLang changes again — the vi native row goes stale, but the
        // accreted ru row is a real translation a reader asked for.
        doc.name = 'Título Original Dois';
        doc.sourceLang = 'pt';
        await upsertSearchRow(doc);

        const rows = await BlueprintSearchModel.model.find({ blueprintId: doc._id }).lean();
        expect(rows.map(r => r.lang).sort()).to.deep.equal(['en', 'pt', 'ru']);
        expect(rows.find(r => r.lang === 'ru')!.origin).to.equal('machine');
      });
    });
  });

  // spec/search-followups.md Part 1 §4 — retrieval reading the rows phase 5
  // (and now §2.9) accretes. lexicalRetrieval widens its $in to
  // [viewerLang, 'en'] instead of hard-coding ['en'].
  describe('viewer-language retrieval (Part 1 §4)', function () {
    it('finds a blueprint via its native-language row only when the viewer content locale is set', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['Ladder']),
      });
      // Simulate a pre-titleOriginal-backfill row: the pivot was already
      // machine-translated away from the Vietnamese words, and (unlike the
      // usual phase 3b write) titleOriginal is still null here — isolating
      // this test to what the native row alone buys, not what titleOriginal
      // (Part 1 §1) already covers on its own.
      await BlueprintSearchModel.model.updateOne(
        { blueprintId: doc._id, lang: 'en' },
        { $set: { title: 'Water Filter Farm', origin: 'machine', titleOriginal: null } }
      );
      const enRow = await BlueprintSearchModel.model
        .findOne({ blueprintId: doc._id, lang: 'en' })
        .lean();
      await BlueprintSearchModel.model.create({
        blueprintId: doc._id,
        lang: 'vi',
        textLang: 'none',
        origin: 'authored',
        title: 'Máy lọc nước',
        titleOriginal: null,
        description: '',
        terms: enRow!.terms,
        termIds: enRow!.termIds,
        clusterKey: enRow!.clusterKey,
        sourceHash: 'native-vi-hash',
        isPublished: true,
        deletedAt: null,
      });

      const id = (doc._id as Types.ObjectId).toString();
      const enOnly = (await searchBlueprintIds('máy lọc')).map(String);
      expect(enOnly).to.not.include(id);

      const withViewerLang = (await searchBlueprintIds('máy lọc', { viewerLang: 'vi' })).map(
        String
      );
      expect(withViewerLang).to.include(id);
    });

    it('widening the $in never narrows away the en pivot for a viewer in another language', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Solo Pivot Base',
        data: bpData(['Ladder']),
      });
      const ids = (await searchBlueprintIds('solo pivot', { viewerLang: 'ru' })).map(String);
      expect(ids).to.include((doc._id as Types.ObjectId).toString());
    });

    it('an unparseable viewerLang is ignored rather than fanning the $in out unbounded', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Fallback Pivot Base',
        data: bpData(['Ladder']),
      });
      // normalizeContentLocale takes the segment before the first '-'/'_' and
      // accepts a 2-3 letter base tag — 'not-a-real-language-tag' would
      // normalize to the (accepted) 'not', so this uses a value that fails
      // the shape check outright: a 4-letter segment with no separator.
      const ids = (await searchBlueprintIds('fallback pivot', { viewerLang: 'zzzz' })).map(String);
      expect(ids).to.include((doc._id as Types.ObjectId).toString());
    });

    it('a bilingual match (both rows hit the query) contributes exactly one entry, not two', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Zephyr Crate Bunker',
        data: bpData(['Ladder']),
      });
      const enRow = await BlueprintSearchModel.model
        .findOne({ blueprintId: doc._id, lang: 'en' })
        .lean();
      // A native row carrying the SAME text as the pivot — both rows match
      // the same query, the double-counting shape Part 1 §4 warned about.
      await BlueprintSearchModel.model.create({
        blueprintId: doc._id,
        lang: 'vi',
        textLang: 'none',
        origin: 'authored',
        title: 'Zephyr Crate Bunker',
        titleOriginal: null,
        description: '',
        terms: enRow!.terms,
        termIds: enRow!.termIds,
        clusterKey: enRow!.clusterKey,
        sourceHash: 'bilingual-dup-hash',
        isPublished: true,
        deletedAt: null,
      });

      const matches = await searchBlueprints('zephyr crate bunker', { viewerLang: 'vi' });
      const id = (doc._id as Types.ObjectId).toString();
      expect(matches.filter(m => m.id.toString() === id)).to.have.length(1);
    });
  });

  // spec/search-followups.md §2.6. The picker turns sourceLang from a guess
  // into a declaration, which is the only route by which a short romanized
  // title gets translated at save time rather than waiting for the batch pass.
  describe('declared source language (§2.6)', function () {
    let fake: FakeTranslationProvider;
    let viCalls: string[];

    beforeEach(async function () {
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      fake = new FakeTranslationProvider();
      TranslationService.setInstanceForTest(new TranslationService(fake));
      viCalls = [];
      const viProvider: VietnameseTitleProvider = {
        translate: async inputs => {
          viCalls.push(...inputs.map(input => input.text));
          return {
            results: inputs.map(input =>
              input.text === 'Dien phan full'
                ? {
                    id: input.id,
                    status: 'translated' as const,
                    restoredVi: 'Điện phân full',
                    english: 'Electrolysis full',
                    alternatives: [],
                  }
                : {
                    id: input.id,
                    status: 'not-vietnamese' as const,
                    restoredVi: '',
                    english: '',
                    alternatives: [],
                  }
            ),
            usage: { inputTokens: 100, outputTokens: 20, thoughtTokens: 0, totalTokens: 120 },
            latencyMs: 1,
          };
        },
      };
      VietnameseTitleTranslationService.setInstanceForTest(
        new VietnameseTitleTranslationService(viProvider)
      );
      process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'true';
      process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD = '100000';
      process.env.GEMINI_API_KEY = 'test-only';
    });

    afterEach(async function () {
      TranslationService.setInstanceForTest(null);
      VietnameseTitleTranslationService.setInstanceForTest(null);
      delete process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED;
      delete process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD;
      delete process.env.GEMINI_API_KEY;
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
    });

    // The title our own detector cannot place — the whole point.
    it('translates a title the detector cannot place when the author declared a language', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Dien phan full',
        data: bpData(['Electrolyzer']),
      });

      expect(await deriveSearchRowWithTranslation(doc, null)).to.have.property(
        'origin',
        'authored'
      );

      const declared = await deriveSearchRowWithTranslation(doc, null, 'vi');
      expect(declared.origin).to.equal('machine');
      expect(declared.title).to.equal('Electrolysis full');
      expect(declared.titleOriginal).to.equal('Dien phan full');
      expect(viCalls).to.deep.equal(['Dien phan full']);
    });

    // The guard that makes a misdeclaration cheap: a Vietnamese-locale author
    // writing an English title comes back reported as English and stays put.
    it('leaves the row authored when the provider says the text was English', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Spom v2 base',
        data: bpData(['Electrolyzer']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null, 'vi');
      expect(fields.origin).to.equal('authored');
      expect(fields.title).to.equal('Spom v2 base');
    });

    // Regression: the gate declining a title and the gate being switched off
    // both surface as a non-translated outcome, but only the first is a
    // verdict. Read as one, the default configuration silently stops
    // translating declared-Vietnamese titles that Google handles today.
    it('still uses Google when the Vietnamese gate is switched off', async function () {
      process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'false';
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Dien phan full',
        data: bpData(['Electrolyzer']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null, 'vi');

      expect(viCalls).to.have.length(0);
      expect(fake.calls).to.have.length(1);
      expect(fields.origin).to.equal('machine');
      expect(fields.titleOriginal).to.equal('Dien phan full');
    });

    it('does not act on a declaration of English', async function () {
      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Dien phan full',
        data: bpData(['Electrolyzer']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null, 'en');
      expect(fields.origin).to.equal('authored');
      expect(fake.calls).to.have.length(0);
    });

    // A provider that hands the text back unchanged translated nothing —
    // claiming 'machine' would index the same string twice.
    it('leaves the row authored when the provider returns the input unchanged', async function () {
      const echoProvider: TranslationProvider = {
        isConfigured: () => true,
        translate: async texts => texts.map(text => ({ text, detectedSourceLang: 'vi' })),
      };
      TranslationService.setInstanceForTest(new TranslationService(echoProvider));

      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Máy lọc nước',
        data: bpData(['WaterPurifier']),
      });

      const fields = await deriveSearchRowWithTranslation(doc, null);
      expect(fields.origin).to.equal('authored');
      expect(fields.titleOriginal).to.equal(null);
    });

    it('uses the stored preference as the prior for sourceLang on save', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .patch('/api/users/me/locale-preference')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'vi' });

      const saved = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        // Deliberately a title no detector can place, sent with an English
        // Accept-Language: only the declaration can produce 'vi' here.
        .set('Accept-Language', 'en-US,en;q=0.9')
        .send({
          name: 'Dien phan full',
          blueprint: bpData(['Electrolyzer']),
          thumbnail: 'base64thumbnail',
        });
      expect(saved.status).to.equal(200);

      const savedBlueprint = await BlueprintModel.model.findById(saved.body.id);
      expect(savedBlueprint!.sourceLang).to.equal('vi');
    });

    it('falls back to the Accept-Language prior for an author who never chose', async function () {
      const token = testData.users.user2.generateJwt();
      const saved = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Language', 'vi-VN,vi;q=0.9')
        .send({
          name: 'Dien phan full',
          blueprint: bpData(['Electrolyzer']),
          thumbnail: 'base64thumbnail',
        });
      expect(saved.status).to.equal(200);

      const savedBlueprint = await BlueprintModel.model.findById(saved.body.id);
      expect(savedBlueprint!.sourceLang).to.equal('vi');
    });
  });

  // spec/search-followups.md Part 1 §2. The trap this exists to avoid:
  // translateMany short-circuits on `sourceLang == null && ASCII_ONLY`, which
  // is EXACTLY this candidate set, so without the bypass the pass would report
  // success having made no provider call at all.
  describe('provider-side detection bypass (Part 1 §2)', function () {
    let fake: FakeTranslationProvider;

    beforeEach(async function () {
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      fake = new FakeTranslationProvider();
      TranslationService.setInstanceForTest(new TranslationService(fake));
    });

    afterEach(async function () {
      TranslationService.setInstanceForTest(null);
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
    });

    it('short-circuits a short ASCII title with no declared source language', async function () {
      const [result] = await TranslationService.instance.translateMany(
        [{ sourceText: 'Dien phan full', sourceLang: null, targetLang: 'en' }],
        null
      );
      expect(result.translatedText).to.equal('Dien phan full');
      expect(fake.calls).to.have.length(0);
    });

    it('reaches the provider for the same input when detection is forced', async function () {
      fake.detectedSourceLang = 'vi';
      const [result] = await TranslationService.instance.translateMany(
        [
          {
            sourceText: 'Dien phan full',
            sourceLang: null,
            targetLang: 'en',
            forceProviderDetection: true,
          },
        ],
        null
      );
      expect(fake.calls).to.have.length(1);
      expect(result.translatedText).to.equal('[en] Dien phan full');
      // The provider's own verdict is what the caller gates on.
      expect(result.sourceLang).to.equal('vi');
    });

    // Re-runs are free: the cache is keyed by text hash and stores the
    // detected language, so asking about a known title costs nothing.
    it('serves a repeat forced-detection request from the cache', async function () {
      fake.detectedSourceLang = 'vi';
      const input = {
        sourceText: 'Dien phan full',
        sourceLang: null,
        targetLang: 'en',
        forceProviderDetection: true,
      };
      await TranslationService.instance.translateMany([input], null);
      const [second] = await TranslationService.instance.translateMany([input], null);

      expect(fake.calls).to.have.length(1);
      expect(second.cached).to.equal(true);
      expect(second.sourceLang).to.equal('vi');
    });
  });

  describe('query translation (phase 4)', function () {
    let fake: FakeTranslationProvider;

    beforeEach(async function () {
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      await SearchQueryModel.model.deleteMany({});
      fake = new FakeTranslationProvider();
      TranslationService.setInstanceForTest(new TranslationService(fake));
    });

    afterEach(async function () {
      delete process.env.MONTHLY_CHAR_BUDGET;
      TranslationService.setInstanceForTest(null);
      await TranslationUnitModel.model.deleteMany({});
      await TranslationBudgetModel.model.deleteMany({});
      await SearchQueryModel.model.deleteMany({});
    });

    it('skips translation entirely when every token resolves via the term dictionary', async function () {
      const spom = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Untitled 12',
        data: bpData(['Electrolyzer', 'GasPump']),
      });

      const ids = (await searchBlueprintIds('spom')).map(id => id.toString());
      expect(ids).to.include((spom._id as Types.ObjectId).toString());
      expect(fake.calls).to.have.length(0);

      const row = await SearchQueryModel.model.findOne({ normalizedQuery: 'spom' });
      expect(row!.translated).to.equal(false);
      expect(row!.hitCount).to.equal(1);
    });

    it('does not spend a translation on a short, all-ASCII, unresolved English query', async function () {
      await searchBlueprintIds('cool unnamed build');
      expect(fake.calls).to.have.length(0);

      const row = await SearchQueryModel.model.findOne({ normalizedQuery: 'cool unnamed build' });
      expect(row!.translated).to.equal(false);
    });

    it('translates the unresolved remainder of a confidently non-English query and finds the English title', async function () {
      // A real (test-only) provider returning genuine English text, so this
      // proves the deliverable: a Vietnamese query finds an English-titled
      // blueprint, not just that some string came back.
      const englishProvider: TranslationProvider = {
        isConfigured: () => true,
        translate: async texts =>
          texts.map(() => ({ text: 'water filter', detectedSourceLang: 'vi' })),
      };
      TranslationService.setInstanceForTest(new TranslationService(englishProvider));

      const doc = await TestDbHelper.createTestBlueprint(testData.users.user1._id, {
        name: 'Water Filter Setup',
        data: bpData(['WaterPurifier']),
      });

      const ids = (await searchBlueprintIds('máy lọc nước')).map(id => id.toString());
      expect(ids).to.include((doc._id as Types.ObjectId).toString());

      let row = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        row = await SearchQueryModel.model.findOne({ normalizedQuery: 'máy lọc nước' });
        if (row != null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(row!.sourceLang).to.equal('vi');
      expect(row!.translated).to.equal(true);
    });

    it('caches the translated remainder — a repeat query issues no second provider call', async function () {
      await searchBlueprintIds('máy lọc nước');
      expect(fake.calls).to.have.length(1);

      await searchBlueprintIds('máy lọc nước');
      expect(fake.calls).to.have.length(1); // second search hit the translationunits cache
    });

    it('records telemetry even when translation is not configured, and never throws', async function () {
      fake.configured = false;
      const ids = await searchBlueprintIds('máy lọc nước');
      expect(ids).to.deep.equal([]);
      expect(fake.calls).to.have.length(0);

      const row = await SearchQueryModel.model.findOne({ normalizedQuery: 'máy lọc nước' });
      expect(row!.translated).to.equal(false);
    });

    it('falls back to an untranslated (empty) search when the monthly budget is exhausted, without throwing', async function () {
      const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
      process.env.MONTHLY_CHAR_BUDGET = '1';
      await TranslationBudgetModel.model.create({
        month,
        userId: null,
        charCount: 999999,
        requestCount: 1,
      });

      const ids = await searchBlueprintIds('máy lọc nước');
      expect(ids).to.deep.equal([]);
      expect(fake.calls).to.have.length(0);
    });

    it("a translation spend counts against the searching user's daily cap", async function () {
      const englishProvider: TranslationProvider = {
        isConfigured: () => true,
        translate: async texts =>
          texts.map(() => ({ text: 'water filter', detectedSourceLang: 'vi' })),
      };
      TranslationService.setInstanceForTest(new TranslationService(englishProvider));

      const userId = (testData.users.user1._id as Types.ObjectId).toString();
      await searchBlueprintIds('máy lọc nước', { userId });

      // dayKey() in translation-service.ts is exactly monthKey()-DD, which is
      // the UTC ISO date's first 10 characters.
      const day = new Date().toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const userRow = await TranslationBudgetModel.model.findOne({ userId, month, day });
      expect(userRow).to.not.equal(null);
      expect(userRow!.requestCount).to.be.greaterThan(0);
    });
  });
});
