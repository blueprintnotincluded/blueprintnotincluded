import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { TranslationModel } from '../../app/api/models/translation';
import { TranslationBudgetModel } from '../../app/api/models/translation-budget';
import { TranslationService, TranslationBudgetExceeded } from '../../app/api/services/translation-service';
import { FakeTranslationProvider } from '../helpers/fake-translation-provider';

describe('TranslationService', function () {
  let fake: FakeTranslationProvider;
  let service: TranslationService;

  beforeEach(async function () {
    this.timeout(10000);
    await TestSetup.beforeEach();
    await TranslationModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    fake = new FakeTranslationProvider();
    service = new TranslationService(fake);
  });

  afterEach(async function () {
    this.timeout(5000);
    delete process.env.MONTHLY_CHAR_BUDGET;
    delete process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY;
    await TranslationModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    await TestSetup.afterEach();
  });

  describe('same-language shortcut', function () {
    it('makes zero provider calls when sourceLang matches targetLang', async function () {
      const result = await service.translateOne(
        {
          kind: 'blueprint',
          refId: '507f1f77bcf86cd799439001',
          sourceText: 'Hello there',
          sourceLang: 'en',
          targetLang: 'en',
        },
        null
      );
      expect(result).to.deep.equal({ translatedText: 'Hello there', sourceLang: 'en', cached: true, provider: 'none' });
      expect(fake.calls).to.have.length(0);
      expect(await TranslationModel.model.countDocuments({})).to.equal(0);
    });

    it('collapses zh-Hans to zh for the comparison', async function () {
      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: '你好', sourceLang: 'zh', targetLang: 'zh-Hans' },
        null
      );
      expect(result.cached).to.equal(true);
      expect(fake.calls).to.have.length(0);
    });

    it('skips translation for ASCII-only text with no detected source language', async function () {
      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'plain ascii text', sourceLang: null, targetLang: 'ru' },
        null
      );
      expect(result.cached).to.equal(true);
      expect(fake.calls).to.have.length(0);
    });

    it('still calls the provider for non-ASCII text with an unknown source language', async function () {
      await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Café résumé', sourceLang: null, targetLang: 'ru' },
        null
      );
      expect(fake.calls).to.have.length(1);
    });
  });

  describe('caching', function () {
    it('calls the provider on a miss and caches the result', async function () {
      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );
      expect(fake.calls).to.have.length(1);
      expect(result.cached).to.equal(false);
      expect(result.translatedText).to.equal('[en] Bonjour le monde');

      const row = await TranslationModel.model.findOne({ kind: 'blueprint', refId: '507f1f77bcf86cd799439001', targetLang: 'en' });
      expect(row).to.not.be.null;
      expect(row!.translatedText).to.equal('[en] Bonjour le monde');
      expect(row!.provider).to.equal('google-v2');
    });

    it('serves a cache hit without a second provider call', async function () {
      const input = { kind: 'blueprint' as const, refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' };
      await service.translateOne(input, null);
      const second = await service.translateOne(input, null);

      expect(fake.calls).to.have.length(1);
      expect(second.cached).to.equal(true);
      expect(second.translatedText).to.equal('[en] Bonjour le monde');
    });

    it('re-translates when the source text changes (sourceHash mismatch)', async function () {
      await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );
      const second = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour tout le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );

      expect(fake.calls).to.have.length(2);
      expect(second.cached).to.equal(false);
      expect(second.translatedText).to.equal('[en] Bonjour tout le monde');
      // Same row, upserted — not a second document
      expect(await TranslationModel.model.countDocuments({ kind: 'blueprint', refId: '507f1f77bcf86cd799439001', targetLang: 'en' })).to.equal(1);
    });

    it('a human-provided row always wins and is never overwritten by a machine translation', async function () {
      await TranslationModel.model.create({
        kind: 'blueprint',
        refId: '507f1f77bcf86cd799439001',
        targetLang: 'en',
        sourceLang: 'fr',
        sourceHash: 'stale-hash-does-not-matter',
        translatedText: 'A human-corrected translation',
        provider: 'human',
        charCount: 30,
      });

      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );

      expect(fake.calls).to.have.length(0);
      expect(result.translatedText).to.equal('A human-corrected translation');
      expect(result.provider).to.equal('human');
    });
  });

  describe('budget enforcement', function () {
    it('throws before calling the provider once the monthly budget is exceeded', async function () {
      process.env.MONTHLY_CHAR_BUDGET = '5';
      await TranslationBudgetModel.model.create({ month: monthKey(), userId: null, charCount: 10, requestCount: 1 });

      let threw = false;
      try {
        await service.translateOne(
          { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
          null
        );
      } catch (err) {
        threw = true;
        expect(err).to.be.instanceOf(TranslationBudgetExceeded);
      }
      expect(threw).to.equal(true);
      expect(fake.calls).to.have.length(0);
    });

    it('cache reads keep working even when the budget is exceeded', async function () {
      // Populate the cache first, while under budget
      await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );

      process.env.MONTHLY_CHAR_BUDGET = '1';
      await TranslationBudgetModel.model.updateOne({ month: monthKey(), userId: null }, { $set: { charCount: 999999 } });

      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        null
      );
      expect(result.cached).to.equal(true);
      expect(fake.calls).to.have.length(1); // only the first (pre-budget-exceeded) call
    });

    it('increments both the site and per-user budget docs by the billed character count', async function () {
      const userId = '507f1f77bcf86cd799439011';
      await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        userId
      );

      const siteRow = await TranslationBudgetModel.model.findOne({ month: monthKey(), userId: null });
      expect(siteRow!.charCount).to.equal('Bonjour le monde'.length);
      expect(siteRow!.requestCount).to.equal(1);

      const userRow = await TranslationBudgetModel.model.findOne({ userId, month: monthKey() });
      expect(userRow!.charCount).to.equal('Bonjour le monde'.length);
      expect(userRow!.requestCount).to.equal(1);
    });

    it('enforces the per-user daily cap independently of the site budget', async function () {
      process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY = '1';
      const userId = '507f1f77bcf86cd799439011';
      await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439001', sourceText: 'Bonjour le monde', sourceLang: 'fr', targetLang: 'en' },
        userId
      );

      let threw = false;
      try {
        await service.translateOne(
          { kind: 'blueprint', refId: '507f1f77bcf86cd799439002', sourceText: 'Une autre phrase ici', sourceLang: 'fr', targetLang: 'en' },
          userId
        );
      } catch (err) {
        threw = true;
        expect(err).to.be.instanceOf(TranslationBudgetExceeded);
      }
      expect(threw).to.equal(true);

      // A different user is unaffected
      const otherResult = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439003', sourceText: 'Encore une phrase', sourceLang: 'fr', targetLang: 'en' },
        '507f1f77bcf86cd799439099'
      );
      expect(otherResult.cached).to.equal(false);
    });

    // Regression for the {month, userId} unique index that used to collide a
    // user's second day of a month against their first (E11000 on upsert).
    it('lets the same user translate again on a new day within the same month', async function () {
      const userId = '507f1f77bcf86cd799439011';
      await TranslationBudgetModel.model.create({
        month: monthKey(),
        day: `${monthKey()}-01`,
        userId,
        charCount: 500,
        requestCount: 3,
      });

      const result = await service.translateOne(
        { kind: 'blueprint', refId: '507f1f77bcf86cd799439004', sourceText: 'Une phrase du jour suivant', sourceLang: 'fr', targetLang: 'en' },
        userId
      );

      expect(result.cached).to.equal(false);
      expect(
        await TranslationBudgetModel.model.countDocuments({ userId, month: monthKey() })
      ).to.equal(2);
    });
  });

  describe('batching', function () {
    it('translates a batch of misses in a single provider call', async function () {
      const results = await service.translateMany(
        [
          { kind: 'comment', refId: '507f1f77bcf86cd799439011', sourceText: 'Bonjour', sourceLang: 'fr', targetLang: 'en' },
          { kind: 'comment', refId: '507f1f77bcf86cd799439012', sourceText: 'Au revoir', sourceLang: 'fr', targetLang: 'en' },
        ],
        null
      );
      expect(fake.calls).to.have.length(1);
      expect(fake.calls[0].texts).to.deep.equal(['Bonjour', 'Au revoir']);
      expect(results.map(r => r.translatedText)).to.deep.equal(['[en] Bonjour', '[en] Au revoir']);
    });

    it('mixes cache hits and misses in one batch without extra provider calls for the hits', async function () {
      await service.translateOne(
        { kind: 'comment', refId: '507f1f77bcf86cd799439011', sourceText: 'Bonjour', sourceLang: 'fr', targetLang: 'en' },
        null
      );
      const results = await service.translateMany(
        [
          { kind: 'comment', refId: '507f1f77bcf86cd799439011', sourceText: 'Bonjour', sourceLang: 'fr', targetLang: 'en' },
          { kind: 'comment', refId: '507f1f77bcf86cd799439012', sourceText: 'Au revoir', sourceLang: 'fr', targetLang: 'en' },
        ],
        null
      );
      expect(fake.calls).to.have.length(2); // one for the first translateOne, one for the c2 miss
      expect(fake.calls[1].texts).to.deep.equal(['Au revoir']);
      expect(results[0].cached).to.equal(true);
      expect(results[1].cached).to.equal(false);
    });
  });

  describe('reference-token safety (comments)', function () {
    it('tokenizes references before sending to the provider and restores them after', async function () {
      const result = await service.translateOne(
        {
          kind: 'comment',
          refId: '507f1f77bcf86cd799439011',
          sourceText: 'merci {{user:507f1f77bcf86cd799439011}} pour ce beau plan',
          sourceLang: 'fr',
          targetLang: 'en',
          hasReferenceTokens: true,
        },
        null
      );
      // The provider never saw the raw token
      expect(fake.calls[0].texts[0]).to.not.contain('{{user:');
      // But the restored result has it back, verbatim
      expect(result.translatedText).to.contain('{{user:507f1f77bcf86cd799439011}}');
      expect(result.degraded).to.be.undefined;
    });

    it('discards a corrupted round-trip and returns the original text as degraded', async function () {
      // Force the fake provider to mangle output: swallow the placeholder by
      // stripping everything after "[en] " so the sentinel never survives.
      fake.translate = async () => [{ text: 'a translation with no placeholder at all', detectedSourceLang: 'fr' }];

      const result = await service.translateOne(
        {
          kind: 'comment',
          refId: '507f1f77bcf86cd799439011',
          sourceText: 'merci {{user:507f1f77bcf86cd799439011}} pour ce beau plan',
          sourceLang: 'fr',
          targetLang: 'en',
          hasReferenceTokens: true,
        },
        null
      );
      expect(result.degraded).to.equal(true);
      expect(result.translatedText).to.equal('merci {{user:507f1f77bcf86cd799439011}} pour ce beau plan');
      // A degraded result must never be cached
      expect(await TranslationModel.model.countDocuments({})).to.equal(0);
    });
  });

  it('reports 503-worthy unconfigured state through isConfigured()', function () {
    fake.configured = false;
    expect(service.isConfigured()).to.equal(false);
  });

  function monthKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
});
