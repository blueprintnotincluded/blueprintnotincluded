import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { CommentModel } from '../../app/api/models/comment';
import { BlueprintSearchModel } from '../../app/api/models/blueprint-search';
import { TranslationUnitModel } from '../../app/api/models/translation-unit';
import { TranslationBudgetModel } from '../../app/api/models/translation-budget';
import { TranslationService } from '../../app/api/services/translation-service';
import { upsertSearchRow } from '../../app/api/services/search-index-service';
import { FakeTranslationProvider } from '../helpers/fake-translation-provider';

describe('Translation API', function () {
  let testData: any;
  let fake: FakeTranslationProvider;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(10000);
    testData = await TestSetup.beforeEach();
    await TranslationUnitModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    fake = new FakeTranslationProvider();
    TranslationService.setInstanceForTest(new TranslationService(fake));

    blueprintId = testData.blueprints.popularBlueprint._id.toString();
    await BlueprintModel.model.updateOne(
      { _id: blueprintId },
      { $set: { description: 'Bonjour le monde et bienvenue', sourceLang: 'fr' } }
    );
  });

  afterEach(async function () {
    this.timeout(5000);
    // Cleared here (not at the end of the test that sets it) so a failed
    // assertion in that test can't leak the override into every later test.
    delete process.env.MONTHLY_CHAR_BUDGET;
    delete process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY;
    TranslationService.setInstanceForTest(null);
    await TranslationUnitModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    await TestSetup.afterEach();
  });

  // ─── POST /api/blueprints/:id/translate ────────────────────────────────────

  describe('POST /api/blueprints/:id/translate', function () {
    it('requires auth', async function () {
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(401);
    });

    it('503s when the provider is not configured', async function () {
      fake.configured = false;
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(503);
    });

    it('400s on an unsupported target language', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'fr' }); // not one of the four UI locales
      expect(response.status).to.equal(400);
      expect(fake.calls).to.have.length(0);
    });

    it('404s for an unknown blueprint', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/blueprints/0123456789abcdef01234567/translate')
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(404);
    });

    it('404s for a draft blueprint viewed by a non-owner', async function () {
      await BlueprintModel.model.updateOne({ _id: blueprintId }, { $set: { isPublished: false } });
      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(404);
    });

    it('translates the description and returns it', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      expect(response.status).to.equal(200);
      expect(response.body.description).to.equal('[en] Bonjour le monde et bienvenue');
      expect(response.body.sourceLang).to.equal('fr');
      expect(response.body.cached).to.equal(false);
      expect(fake.calls).to.have.length(1);
    });

    it('200s from cache on a second call (no second provider call)', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      const second = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      expect(second.status).to.equal(200);
      expect(second.body.cached).to.equal(true);
      expect(fake.calls).to.have.length(1);
    });

    it('400s when the blueprint has no description', async function () {
      await BlueprintModel.model.updateOne({ _id: blueprintId }, { $set: { description: null } });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(400);
    });

    it('429s with the budget-exceeded code once the monthly budget is spent', async function () {
      process.env.MONTHLY_CHAR_BUDGET = '1';
      await TranslationBudgetModel.model.create({
        month: monthKey(),
        userId: null,
        charCount: 999999,
        requestCount: 1,
      });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      expect(response.status).to.equal(429);
      expect(response.body.code).to.equal('TRANSLATION_BUDGET_EXCEEDED');
    });

    it('429s when the caller has spent their per-user daily cap', async function () {
      process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY = '1';
      const user = testData.users.user1;
      const day = `${monthKey()}-${String(new Date().getUTCDate()).padStart(2, '0')}`;
      await TranslationBudgetModel.model.create({
        month: monthKey(),
        day,
        userId: user._id.toString(),
        charCount: 100,
        requestCount: 1,
      });
      const token = user.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      expect(response.status).to.equal(429);
      expect(response.body.code).to.equal('TRANSLATION_BUDGET_EXCEEDED');
      expect(fake.calls).to.have.length(0);
    });

    it('500s (without caching) when the provider itself fails', async function () {
      fake.failNext = true;
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });

      expect(response.status).to.equal(500);
      expect(await TranslationUnitModel.model.countDocuments({})).to.equal(0);
    });
  });

  // ─── Lazy accretion into blueprintsearch (phase 5) ─────────────────────────

  describe('lazy accretion into blueprintsearch (phase 5)', function () {
    async function pollForRow(lang: string) {
      let row = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        row = await BlueprintSearchModel.model.findOne({ blueprintId, lang });
        if (row != null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return row;
    }

    it('never touches the en pivot row — it has its own race-safe writer (phase 3b)', async function () {
      const blueprint = await BlueprintModel.model.findById(blueprintId);
      await upsertSearchRow(blueprint!);
      const pivotBefore = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'en' });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en' });
      expect(response.status).to.equal(200);

      // Give any stray fire-and-forget write a moment, then confirm the
      // pivot row is untouched — same origin/title/sourceHash as before.
      await new Promise(resolve => setTimeout(resolve, 100));
      const pivotAfter = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'en' });
      expect(pivotAfter!.origin).to.equal(pivotBefore!.origin);
      expect(pivotAfter!.title).to.equal(pivotBefore!.title);
      expect(pivotAfter!.sourceHash).to.equal(pivotBefore!.sourceHash);
      // Only the description-translate call — no extra title call, since the
      // 'en'-target guard returns before ever reaching the provider.
      expect(fake.calls).to.have.length(1);
    });

    it('writes a new-language row with the translated title and description, origin machine', async function () {
      const blueprint = await BlueprintModel.model.findById(blueprintId);
      await upsertSearchRow(blueprint!);

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'ko' });
      expect(response.status).to.equal(200);

      const row = await pollForRow('ko');
      expect(row).to.not.be.null;
      expect(row!.origin).to.equal('machine');
      expect(row!.description).to.equal('[ko] Bonjour le monde et bienvenue');
      expect(row!.title).to.equal('[ko] Super Coal Generator Setup');
      // Reused from the en pivot row rather than recomputed from raw data.
      expect(row!.termIds).to.deep.equal(['Battery', 'Generator', 'Wire']);
      // One call for the description (already spent by the endpoint itself)
      // plus one for the title.
      expect(fake.calls).to.have.length(2);
    });

    it('falls back to empty terms when no en pivot row exists yet', async function () {
      await BlueprintSearchModel.model.deleteMany({ blueprintId });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'ru' });
      expect(response.status).to.equal(200);

      const row = await pollForRow('ru');
      expect(row).to.not.be.null;
      expect(row!.termIds).to.deep.equal([]);
      expect(row!.terms).to.deep.equal([]);
      expect(row!.description).to.equal('[ru] Bonjour le monde et bienvenue');
    });

    it('discards the accreted row when the pivot changes mid-translation (concurrent save)', async function () {
      this.timeout(3000);
      const blueprint = await BlueprintModel.model.findById(blueprintId);
      await upsertSearchRow(blueprint!);

      // Slow the title-translate call down so there's a real window between
      // the initial pivot read and the write — long enough for a concurrent
      // save's own search-row derivation to land in between.
      fake.delayMs = 150;

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'ko' });
      expect(response.status).to.equal(200);

      // Simulate a concurrent save: the pivot row is re-derived (new title,
      // new termIds, new sourceHash) while the fire-and-forget title
      // translation above is still in flight.
      const resaved = await BlueprintModel.model.findById(blueprintId);
      resaved!.name = 'Retitled Mid-Flight';
      await resaved!.save();
      await upsertSearchRow(resaved!);

      // Poll the full window the fire-and-forget write could land in. If the
      // stale-pivot guard is missing, the row appears with termIds/title
      // captured from BEFORE the concurrent save; if it's working, no row is
      // ever written for this attempt at all.
      let row = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        row = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'ko' });
        if (row != null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(row).to.be.null;
    });

    it('comment translation does not write a blueprintsearch row — comments have no field for it', async function () {
      const comment = await CommentModel.model.create({
        blueprintId,
        authorId: testData.users.user1._id,
        parentId: null,
        body: 'Bonjour',
        sourceLang: 'fr',
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'ko', ids: [(comment._id as any).toString()] });
      expect(response.status).to.equal(200);

      // Give any stray fire-and-forget write a moment, then confirm nothing landed.
      await new Promise(resolve => setTimeout(resolve, 100));
      const row = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'ko' });
      expect(row).to.be.null;
    });
  });

  // ─── POST /api/blueprints/:id/comments/translate ───────────────────────────

  describe('POST /api/blueprints/:id/comments/translate', function () {
    async function makeComment(body: string, sourceLang: string | null) {
      const comment = await CommentModel.model.create({
        blueprintId,
        authorId: testData.users.user2._id,
        parentId: null,
        body,
        sourceLang,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });
      return (comment._id as any).toString();
    }

    it('requires auth', async function () {
      const id = await makeComment('Bonjour tout le monde ici présent', 'fr');
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .send({ lang: 'en', ids: [id] });
      expect(response.status).to.equal(401);
    });

    it('400s on an empty or non-array ids', async function () {
      const token = testData.users.user1.generateJwt();
      const empty = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids: [] });
      expect(empty.status).to.equal(400);

      const notArray = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids: 'not-an-array' });
      expect(notArray.status).to.equal(400);
    });

    it('400s when the batch exceeds MAX_TRANSLATE_BATCH', async function () {
      const token = testData.users.user1.generateJwt();
      const ids = Array.from({ length: 51 }, () => '0123456789abcdef01234567');
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids });
      expect(response.status).to.equal(400);
    });

    it('translates a batch of comments in one provider call and resolves reference tokens', async function () {
      const idA = await makeComment('Bonjour tout le monde ici présent', 'fr');
      const idB = await makeComment(
        `Merci {{user:${testData.users.user1._id}}} pour ce beau plan génial`,
        'fr'
      );

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids: [idA, idB] });

      expect(response.status).to.equal(200);
      expect(response.body.translations).to.have.length(2);
      expect(fake.calls).to.have.length(1); // one batched provider call

      const first = response.body.translations.find((t: any) => t.id === idA);
      expect(first.segments.some((s: any) => s.type === 'text' && s.text.includes('[en]'))).to.equal(true);

      const second = response.body.translations.find((t: any) => t.id === idB);
      const mentionSegment = second.segments.find((s: any) => s.type === 'user');
      expect(mentionSegment).to.exist;
      expect(mentionSegment.id).to.equal(String(testData.users.user1._id));
      expect(mentionSegment.name).to.equal(testData.users.user1.username);
    });

    it('omits deleted and foreign-blueprint comments from the response', async function () {
      const deletedId = await makeComment('Bonjour tout le monde ici présent', 'fr');
      await CommentModel.model.updateOne({ _id: deletedId }, { $set: { deletedAt: new Date() } });

      // Belongs to a different blueprint — must never be translated through
      // this blueprint's endpoint.
      const otherBlueprintId = testData.blueprints.recentBlueprint._id.toString();
      const foreign = await CommentModel.model.create({
        blueprintId: otherBlueprintId,
        authorId: testData.users.user2._id,
        parentId: null,
        body: 'Une phrase sur un autre plan entièrement',
        sourceLang: 'fr',
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids: [deletedId, (foreign._id as any).toString()] });

      expect(response.status).to.equal(200);
      expect(response.body.translations).to.have.length(0);
      expect(fake.calls).to.have.length(0);
    });
  });

  function monthKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
});
