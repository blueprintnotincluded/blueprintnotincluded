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

// Viewer-locale title resolution at the response boundary
// (spec/search-followups.md §2.5/§2.7). The rule itself is unit-tested in
// __tests__/lib/content-locale.test.ts; these assert that every endpoint that
// returns a title applies it, applies the SAME one, and that nothing on the
// write side ever sees a translated name.

describe('Content locale — title resolution', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(10000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  const AUTHORED = 'Cozinha estrategia em choque';
  const ENGLISH = 'Strategic cooking in conflict';

  // A Portuguese-titled blueprint with a machine English pivot, i.e. exactly
  // what phase 3b's save path and the derive-search backfill produce.
  async function seedTranslated(extra: Record<string, unknown> = {}) {
    const doc = await TestDbHelper.createTestBlueprint(
      testData.users.user1._id as Types.ObjectId,
      { name: AUTHORED, isPublished: true, ...extra }
    );
    await BlueprintModel.model.updateOne({ _id: doc._id }, { $set: { sourceLang: 'pt' } });
    await BlueprintSearchModel.model.updateOne(
      { blueprintId: doc._id, lang: 'en' },
      { $set: { title: ENGLISH, origin: 'machine' } }
    );
    return doc;
  }

  function findItem(body: any, id: string) {
    return body.blueprints.find((b: any) => b.id === id);
  }

  describe('GET /api/getblueprints', function () {
    it('shows the English machine title to a default (English) reader', async function () {
      const doc = await seedTranslated();

      const response = await TestSetup.request().get('/api/getblueprints');
      expect(response.status).to.equal(200);

      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.displayName).to.equal(ENGLISH);
      expect(item.nameTranslated).to.equal(true);
      expect(item.nameSourceLang).to.equal('pt');
      // The authored title is still there — it is what downloads and the
      // duplicate check use, and what the disclosure shows.
      expect(item.name).to.equal(AUTHORED);
    });

    // Rule 1: an author reading in their own language gets their own words.
    it('shows the authored title to a reader of the same language', async function () {
      const doc = await seedTranslated();

      const response = await TestSetup.request().get('/api/getblueprints?lang=pt');
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.name).to.equal(AUTHORED);
      // Nothing to disclose: no resolution was applied.
      expect(item.displayName).to.equal(undefined);
      expect(item.nameTranslated).to.equal(undefined);
    });

    // Rule 3: a Vietnamese reader has no Vietnamese translation of a
    // Portuguese title, so they get the English one — "readable in English"
    // is the deliverable for everyone who isn't the author.
    it('falls back to English for a reader of a third language', async function () {
      const doc = await seedTranslated();

      const response = await TestSetup.request().get('/api/getblueprints?lang=vi');
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.displayName).to.equal(ENGLISH);
      expect(item.nameTranslated).to.equal(true);
    });

    // Rule 4, and the reason this could ship before any backfill.
    it('leaves an untranslated blueprint alone', async function () {
      const doc = await TestDbHelper.createTestBlueprint(
        testData.users.user1._id as Types.ObjectId,
        { name: 'Dien phan full', isPublished: true }
      );

      const response = await TestSetup.request().get('/api/getblueprints?lang=vi');
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.name).to.equal('Dien phan full');
      expect(item.displayName).to.equal(undefined);
    });

    // An 'authored' row is the pivot echoing Blueprint.name, not a
    // translation — resolving against it would report English titles as
    // "translated from English".
    it('never treats an authored pivot row as a translation', async function () {
      const doc = await TestDbHelper.createTestBlueprint(
        testData.users.user1._id as Types.ObjectId,
        { name: 'SPOM v2', isPublished: true }
      );

      const response = await TestSetup.request().get('/api/getblueprints?lang=vi');
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.displayName).to.equal(undefined);
      expect(item.nameTranslated).to.equal(undefined);
    });

    it('ignores a lang parameter that is not a language tag', async function () {
      const doc = await seedTranslated();

      const response = await TestSetup.request().get('/api/getblueprints?lang=%3Cscript%3E');
      expect(response.status).to.equal(200);
      // Unparseable resolves to the default, which is English.
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.displayName).to.equal(ENGLISH);
    });
  });

  describe('GET /api/blueprints/:id (details)', function () {
    // The failure mode this shares one helper to prevent: a card and its
    // details page disagreeing about what a blueprint is called.
    it('resolves the same title the list did', async function () {
      const doc = await seedTranslated();
      const id = (doc._id as Types.ObjectId).toString();

      const list = await TestSetup.request().get('/api/getblueprints');
      const details = await TestSetup.request().get(`/api/blueprints/${id}`);

      expect(details.status).to.equal(200);
      expect(details.body.displayName).to.equal(findItem(list.body, id).displayName);
      expect(details.body.name).to.equal(AUTHORED);
      expect(details.body.nameTranslated).to.equal(true);
      expect(details.body.nameSourceLang).to.equal('pt');
    });

    it('honours lang= on the details endpoint too', async function () {
      const doc = await seedTranslated();
      const id = (doc._id as Types.ObjectId).toString();

      const details = await TestSetup.request().get(`/api/blueprints/${id}?lang=pt`);
      expect(details.body.name).to.equal(AUTHORED);
      expect(details.body.displayName).to.equal(undefined);
    });
  });

  describe('GET /api/getblueprint/:id (editor open)', function () {
    // `name` here is a write-path value: the editor stores it and the save
    // dialog pre-fills from it, so translating it would rewrite the author's
    // title on their next overwrite save.
    it('keeps name authored and puts the resolved title in displayName', async function () {
      const doc = await seedTranslated();
      const id = (doc._id as Types.ObjectId).toString();

      const response = await TestSetup.request().get(`/api/getblueprint/${id}`);
      expect(response.status).to.equal(200);
      expect(response.body.name).to.equal(AUTHORED);
      expect(response.body.displayName).to.equal(ENGLISH);
    });
  });

  describe('resilience', function () {
    // Search rows are derived and disposable. Reading display titles from
    // them widened that contract, and this is the property that makes the
    // widening safe: losing them costs the translation, never the title.
    it('degrades to authored titles when the search rows are gone', async function () {
      const doc = await seedTranslated();
      await BlueprintSearchModel.model.deleteMany({});

      const response = await TestSetup.request().get('/api/getblueprints');
      const item = findItem(response.body, (doc._id as Types.ObjectId).toString());
      expect(item.name).to.equal(AUTHORED);
      expect(item.displayName).to.equal(undefined);
    });

    // Rows stay advisory for VISIBILITY: the authoritative filter still runs
    // against `blueprints`, so a row for a draft cannot pull it into a list.
    it('does not let a search row expose a draft', async function () {
      const doc = await seedTranslated({ isPublished: false });

      const response = await TestSetup.request().get('/api/getblueprints');
      expect(findItem(response.body, (doc._id as Types.ObjectId).toString())).to.equal(undefined);
    });
  });
});
