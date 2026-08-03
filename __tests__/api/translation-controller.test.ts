import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { CommentModel } from '../../app/api/models/comment';
import { TranslationModel } from '../../app/api/models/translation';
import { TranslationBudgetModel } from '../../app/api/models/translation-budget';
import { TranslationService } from '../../app/api/services/translation-service';
import { FakeTranslationProvider } from '../helpers/fake-translation-provider';

describe('Translation API', function () {
  let testData: any;
  let fake: FakeTranslationProvider;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(10000);
    testData = await TestSetup.beforeEach();
    await TranslationModel.model.deleteMany({});
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
    TranslationService.setInstanceForTest(null);
    await TranslationModel.model.deleteMany({});
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
      delete process.env.MONTHLY_CHAR_BUDGET;
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

    it('omits deleted or foreign-blueprint comments from the response', async function () {
      const id = await makeComment('Bonjour tout le monde ici présent', 'fr');
      await CommentModel.model.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });

      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments/translate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lang: 'en', ids: [id] });

      expect(response.status).to.equal(200);
      expect(response.body.translations).to.have.length(0);
    });
  });

  function monthKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
});
