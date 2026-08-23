import { afterEach, beforeEach, describe, it } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { TranslationUnitModel } from '../../app/api/models/translation-unit';
import { TranslationBudgetModel } from '../../app/api/models/translation-budget';
import {
  GeminiVietnameseTitleProvider,
  GeminiVietnameseTitleTransport,
  VietnameseTitleProvider,
  createGeminiVietnameseTitleTransport,
  isUnrecoverableProviderError,
} from '../../app/api/services/gemini-vietnamese-title-provider';
import {
  GEMINI_VI_TITLE_ENDPOINT,
  GEMINI_VI_TITLE_MODEL,
  GEMINI_VI_TITLE_PROMPT_VERSION,
  VietnameseTitleResult,
} from '../../app/api/services/vietnamese-title-prompts';
import {
  isVietnameseTitleGateActive,
  normalizeRomanizedVietnamese,
  vietnameseTitleDryRunCaps,
  VietnameseTitleTranslationService,
} from '../../app/api/services/vietnamese-title-translation-service';
import {
  hashSourceText,
  TranslationBudgetExceeded,
} from '../../app/api/services/translation-service';
import { batchVietnameseCandidates } from '../../app/api/batch/derive-search';

const translationUnitModeMigration = require('../../migrations/20260805000000_translation-unit-modes.js');

class FakeVietnameseTitleProvider implements VietnameseTitleProvider {
  public calls: string[][] = [];
  public status: VietnameseTitleResult['status'] = 'translated';
  public restoredVi = 'Điện phân';
  public english = 'Electrolysis';
  public delayMs = 0;

  async translate(inputs: Array<{ id: string; text: string }>) {
    this.calls.push(inputs.map(input => input.text));
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return {
      results: inputs.map(input => ({
        id: input.id,
        status: this.status,
        restoredVi: this.restoredVi,
        english: this.english,
        alternatives: [],
      })),
      usage: { inputTokens: 100, outputTokens: 20, thoughtTokens: 0, totalTokens: 120 },
      latencyMs: 1,
    };
  }
}

// Replays one scripted result per input, so a fixture can drive the accept
// gate case by case rather than one verdict for the whole batch.
class ScriptedVietnameseTitleProvider implements VietnameseTitleProvider {
  public constructor(private readonly script: Map<string, Omit<VietnameseTitleResult, 'id'>>) {}

  async translate(inputs: Array<{ id: string; text: string }>) {
    return {
      results: inputs.map(input => ({ id: input.id, ...this.script.get(input.text)! })),
      usage: { inputTokens: 100, outputTokens: 20, thoughtTokens: 0, totalTokens: 120 },
      latencyMs: 1,
    };
  }
}

// The exact arm-B ("llm-end-to-end") outputs of the blinded A/B experiment,
// tmp/llm-diacritic-ab-gemini-3-1 — the run this gate's design was chosen on.
// Pinned here because the review that cleared it for production reviewed THESE
// strings: if the gate's accept rules ever drift, the drift shows up as a
// disagreement with the reviewed verdicts rather than silently in prod.
const AB_EXPERIMENT_ARM_B: Array<[string, Omit<VietnameseTitleResult, 'id'>, string | null]> = [
  ['Dien phan', r('Điện phân', 'Electrolysis'), 'Electrolysis'],
  ['Dien phan 2', r('Điện phân 2', 'Electrolysis 2'), 'Electrolysis 2'],
  ['Dien phan nuoc', r('Điện phân nước', 'Water electrolysis'), 'Water electrolysis'],
  ['Loc nuoc ban', r('Lọc nước bẩn', 'Polluted water filtration'), 'Polluted water filtration'],
  ['Bom khi tu dong', r('Bơm khí tự động', 'Automatic gas pump'), 'Automatic gas pump'],
  ['Kho chua khi 2', r('Kho chứa khí 2', 'Gas storage 2'), 'Gas storage 2'],
  ['SPOM tao oxy', r('SPOM tạo oxy', 'Oxygen generating SPOM'), 'Oxygen generating SPOM'],
  ['Lam mat bang dien', r('Làm mát bằng điện', 'Electric cooling'), 'Electric cooling'],
  // Genuinely ambiguous without diacritics: the model declined, so does the gate.
  ['ma', { status: 'ambiguous', restoredVi: 'mã', english: 'code', alternatives: [] }, null],
  ['khi', { status: 'ambiguous', restoredVi: 'khí', english: 'gas', alternatives: [] }, null],
  // English controls: a faithful echo is not a translation, so it is refused
  // rather than rewriting an author's title with itself.
  ['SPOM v3', r('SPOM v3', 'SPOM v3'), null],
  ['Main base', r('Main base', 'Main base'), null],
];

function r(restoredVi: string, english: string): Omit<VietnameseTitleResult, 'id'> {
  return { status: 'translated', restoredVi, english, alternatives: [] };
}

describe('VietnameseTitleTranslationService', function () {
  let fake: FakeVietnameseTitleProvider;
  let service: VietnameseTitleTranslationService;

  beforeEach(async function () {
    this.timeout(10000);
    await TestSetup.beforeEach();
    await TranslationUnitModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'true';
    process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD = '100000';
    process.env.GEMINI_API_KEY = 'test-secret';
    fake = new FakeVietnameseTitleProvider();
    service = new VietnameseTitleTranslationService(fake);
  });

  afterEach(async function () {
    delete process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED;
    delete process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD;
    delete process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS;
    delete process.env.GEMINI_VI_TITLE_MAX_OUTPUT_TOKENS;
    delete process.env.GEMINI_API_KEY;
    await TranslationUnitModel.model.deleteMany({});
    await TranslationBudgetModel.model.deleteMany({});
    await TestSetup.afterEach();
  });

  it('accepts exact mechanical restoration, stores provenance, and reuses its own cache', async function () {
    const first = await service.translateOne('Dien phan', null);
    const second = await service.translateOne('Dien phan', null);

    expect(first).to.include({
      status: 'translated',
      translatedText: 'Electrolysis',
      cached: false,
    });
    expect(second).to.include({
      status: 'translated',
      translatedText: 'Electrolysis',
      cached: true,
    });
    expect(fake.calls).to.have.length(1);
    const row = await TranslationUnitModel.model.findOne({
      textHash: hashSourceText('Dien phan'),
      mode: 'vi-romanized-title-v1',
    });
    expect(row).to.include({
      sourceLang: 'vi',
      targetLang: 'en',
      provider: GEMINI_VI_TITLE_MODEL,
      promptVersion: GEMINI_VI_TITLE_PROMPT_VERSION,
      restoredSourceText: 'Điện phân',
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  it('does not cache ambiguous, negative, inconsistent, unchanged, or marker-losing results', async function () {
    for (const testCase of [
      { status: 'ambiguous' as const, restored: 'Điện phân', english: '' },
      { status: 'not-vietnamese' as const, restored: '', english: '' },
      { status: 'translated' as const, restored: 'Sai', english: 'Wrong' },
      { status: 'translated' as const, restored: 'Điện phân', english: 'Dien phan' },
      { status: 'translated' as const, restored: 'Điện phân', english: 'Dien phan!' },
    ]) {
      fake.status = testCase.status;
      fake.restoredVi = testCase.restored;
      fake.english = testCase.english;
      const result = await service.translateOne('Dien phan', null);
      expect(result.status).not.to.equal('translated');
    }
    fake.status = 'translated';
    fake.restoredVi = 'Điện phân v2';
    fake.english = 'Electrolysis 2';
    expect((await service.translateOne('Dien phan v2', null)).status).to.equal('invalid');
    expect(await TranslationUnitModel.model.countDocuments({})).to.equal(0);
  });

  it('keeps standard Google rows separate and serves Gemini cache after the kill switch is off', async function () {
    await TranslationUnitModel.model.create({
      textHash: hashSourceText('Dien phan'),
      sourceLang: 'vi',
      targetLang: 'en',
      mode: 'standard',
      detectedSourceLang: 'vi',
      translatedText: 'Bad legacy output',
      provider: 'google-v2',
      charCount: 9,
    });
    await service.translateOne('Dien phan', null);
    process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'false';
    process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD = '0';

    const cached = await service.translateOne('Dien phan', null);
    expect(cached).to.include({ translatedText: 'Electrolysis', cached: true });
    expect(await TranslationUnitModel.model.countDocuments({})).to.equal(2);
  });

  it('reserves the maximum before dispatch and pessimistically retains it on provider failure', async function () {
    const failing: VietnameseTitleProvider = {
      translate: async () => {
        throw new Error('provider failed');
      },
    };
    const failingService = new VietnameseTitleTranslationService(failing);
    try {
      await failingService.translateOne('Dien phan', null);
      expect.fail('expected provider failure');
    } catch (error) {
      expect((error as Error).message).to.equal('provider failed');
    }
    const row = await TranslationBudgetModel.model.findOne({ userId: null });
    expect(row!.geminiReservedMicroUsd).to.equal(2176);
    expect(row!.geminiObservedMicroUsd).to.equal(0);
  });

  it('atomically rejects concurrent reservations above the monthly cap', async function () {
    process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD = '2176';
    fake.delayMs = 20;
    const results = await Promise.allSettled([
      service.translateOne('Dien phan', null),
      service.translateOne('Dien phan 2', null),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).to.have.length(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).to.be.instanceOf(TranslationBudgetExceeded);
    expect(fake.calls).to.have.length(1);
  });

  // Regression: the gate reports 'invalid' both when it judged a title and
  // declined it and when it is simply switched off. Callers branch on that
  // difference to decide whether the Google pass behind the gate should still
  // run, so each of the three switches must be visible from the outside.
  // A rate limit or a bad key is trivially identifiable but not recoverable
  // without a human. Since budget is reserved BEFORE each provider call, a
  // caller that treats these as per-batch hiccups and moves on spends the
  // whole monthly allowance on failures — so they must be distinguishable
  // from an ordinary one-batch error.
  it('marks auth and rate-limit failures as needing action, not a retry', async function () {
    const statuses = [401, 403, 429, 500, 400];
    const seen: Array<{ status: number; unrecoverable: boolean }> = [];

    for (const status of statuses) {
      const transport: GeminiVietnameseTitleTransport = {
        send: async () => ({
          status,
          body: { error: { message: `boom ${status}` } },
        }),
      };
      try {
        await new GeminiVietnameseTitleProvider(transport, 'k').translate([
          { id: 'a', text: 'Dien phan' },
        ]);
        expect.fail(`expected HTTP ${status} to throw`);
      } catch (error) {
        expect((error as { status?: number }).status).to.equal(status);
        seen.push({ status, unrecoverable: isUnrecoverableProviderError(error) });
      }
    }

    expect(seen).to.deep.equal([
      { status: 401, unrecoverable: true },
      { status: 403, unrecoverable: true },
      { status: 429, unrecoverable: true },
      // Transient: one batch is skipped, the pass continues.
      { status: 500, unrecoverable: false },
      { status: 400, unrecoverable: false },
    ]);
  });

  it('reports the gate inactive for each switch that stops it spending', function () {
    expect(isVietnameseTitleGateActive()).to.equal(true);

    process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'false';
    expect(isVietnameseTitleGateActive()).to.equal(false);
    process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED = 'true';

    delete process.env.GEMINI_API_KEY;
    expect(isVietnameseTitleGateActive()).to.equal(false);
    process.env.GEMINI_API_KEY = 'test-secret';

    process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD = '0';
    expect(isVietnameseTitleGateActive()).to.equal(false);
  });

  // Regression: staging and production share ONE database, so every migration
  // is run at least twice over the same data and the second run must be a
  // no-op, not an error. The first failure was real — Mongoose's autoIndex had
  // already built the widened key under its own generated name, and the
  // migration insisted on a different one:
  //   "Index already exists with a different name:
  //    textHash_1_sourceLang_1_targetLang_1_mode_1"
  it('converges whether autoIndex or the migration builds the key first', async function () {
    // The name Mongo generates for the widened key — what the schema's
    // unnamed index and the migration must both end up agreeing on.
    const AUTO_INDEX_NAME = 'textHash_1_sourceLang_1_targetLang_1_mode_1';
    const collection = mongoose.connection.db!.collection('translationunits');
    const keyOf = async () =>
      (await collection.indexes()).find(
        index =>
          JSON.stringify(index.key) ===
          JSON.stringify({ textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 })
      );

    // Stand the collection up the way a running app does: autoIndex first.
    await collection.dropIndexes();
    await collection.createIndex(
      { textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 },
      { unique: true }
    );

    await translationUnitModeMigration.up(mongoose.connection.db);
    expect((await keyOf())!.name).to.equal(AUTO_INDEX_NAME);

    // A legacy hand-picked name for the same keys is adopted too, not
    // duplicated — the state a partially-fixed database can be left in.
    await collection.dropIndexes();
    await collection.createIndex(
      { textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 },
      { unique: true, name: 'translation_unit_mode_key' }
    );
    await translationUnitModeMigration.up(mongoose.connection.db);
    expect((await keyOf())!.name).to.equal(AUTO_INDEX_NAME);

    // The second environment's deploy, over the same database.
    await translationUnitModeMigration.up(mongoose.connection.db);
    const settled = await keyOf();
    expect(settled!.name).to.equal(AUTO_INDEX_NAME);
    expect(settled!.unique).to.equal(true);

    // And down/up must survive the same double-run.
    await translationUnitModeMigration.down(mongoose.connection.db);
    await translationUnitModeMigration.down(mongoose.connection.db);
    expect(await keyOf()).to.equal(undefined);
    await translationUnitModeMigration.up(mongoose.connection.db);
    expect((await keyOf())!.name).to.equal(AUTO_INDEX_NAME);
  });

  it('reproduces the reviewed A/B verdicts on the full experiment fixture', async function () {
    const script = new Map(AB_EXPERIMENT_ARM_B.map(([text, result]) => [text, result]));
    const scripted = new VietnameseTitleTranslationService(
      new ScriptedVietnameseTitleProvider(script)
    );

    const outcomes = await scripted.translateMany(
      AB_EXPERIMENT_ARM_B.map(([text], index) => ({ id: `case-${index}`, text })),
      null
    );

    const accepted = outcomes.map(outcome =>
      outcome.status === 'translated' ? (outcome.translatedText ?? null) : null
    );
    expect(accepted).to.deep.equal(AB_EXPERIMENT_ARM_B.map(([, , expected]) => expected));

    // Only the accepted eight reach the cache: an ambiguous answer and an
    // echoed English control both cost a call but must never be persisted.
    expect(await TranslationUnitModel.model.countDocuments({ mode: 'vi-romanized-title-v1' })).to.equal(8);
  });

  it('rejects non-ASCII input without constructing a call', async function () {
    try {
      await service.translateOne('Điện phân', null);
      expect.fail('non-ASCII input must fail');
    } catch (error) {
      expect((error as Error).message).to.contain('non-empty ASCII');
    }
    expect(fake.calls).to.have.length(0);
  });

  // The documented guarantee is that env vars can LOWER the token caps and
  // never raise them. The old combined test set these alongside a non-ASCII
  // input, so it threw on validation before the caps were ever read and this
  // path went untested.
  it('clamps out-of-range and malformed token caps to the code-pinned defaults', async function () {
    process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS = '999999';
    process.env.GEMINI_VI_TITLE_MAX_OUTPUT_TOKENS = 'not-a-number';

    expect(vietnameseTitleDryRunCaps()).to.include({ inputTokens: 4096, outputTokens: 768 });

    const result = await service.translateOne('Dien phan', null);
    expect(result.status).to.equal('translated');
    expect(fake.calls).to.have.length(1);

    // Lowering still works — the cap is a ceiling, not a fixed value.
    process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS = '1024';
    expect(vietnameseTitleDryRunCaps().inputTokens).to.equal(1024);
  });

  it('strips Vietnamese marks and d-with-stroke mechanically', function () {
    expect(normalizeRomanizedVietnamese('Điện phân nước ĐẦY')).to.equal('Dien phan nuoc DAY');
  });

  it('migrates legacy Google/human rows to standard mode and installs the mode-aware key', async function () {
    const db = mongoose.connection.db!;
    const collection = db.collection('translationunits');
    const indexes = await collection.indexes();
    for (const index of indexes) {
      if (
        JSON.stringify(index.key) ===
        JSON.stringify({ textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 })
      ) {
        await collection.dropIndex(index.name!);
      }
    }
    await collection.updateMany({}, { $unset: { mode: '' } });
    await collection.createIndex(
      { textHash: 1, sourceLang: 1, targetLang: 1 },
      { unique: true, name: 'legacy_translation_key' }
    );
    await collection.insertMany([
      {
        textHash: 'legacy-google',
        sourceLang: 'auto',
        targetLang: 'en',
        translatedText: 'Google',
        provider: 'google-v2',
        charCount: 1,
      },
      {
        textHash: 'legacy-human',
        sourceLang: 'vi',
        targetLang: 'en',
        translatedText: 'Human',
        provider: 'human',
        charCount: 1,
      },
    ]);

    await translationUnitModeMigration.up(db);
    await translationUnitModeMigration.up(db);

    expect(await collection.countDocuments({ mode: 'standard' })).to.equal(2);
    // Located by KEY PATTERN, not by name: the key is the invariant the
    // collection depends on, and pinning a name here is what let the name
    // itself drift out of step with the schema's autoIndex.
    const migratedIndexes = await collection.indexes();
    const migratedIndex = migratedIndexes.find(
      index =>
        JSON.stringify(index.key) ===
        JSON.stringify({ textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 })
    );
    expect(migratedIndex, 'mode-aware unique index').to.not.equal(undefined);
    expect(migratedIndex!.unique).to.equal(true);
    await collection.insertOne({
      textHash: 'legacy-human',
      sourceLang: 'vi',
      targetLang: 'en',
      mode: 'vi-romanized-title-v1',
      translatedText: 'Gemini',
      provider: GEMINI_VI_TITLE_MODEL,
      charCount: 1,
    });
    expect(await collection.countDocuments({ textHash: 'legacy-human' })).to.equal(2);
  });
});

describe('GeminiVietnameseTitleProvider', function () {
  it('batches unique corpus candidates by both count and source characters', function () {
    const candidates = Array.from({ length: 13 }, (_, index) => [
      `${index}`.padEnd(60, 'x'),
      [],
    ]) as Parameters<typeof batchVietnameseCandidates>[0];
    const batches = batchVietnameseCandidates(candidates);
    expect(batches.map(batch => batch.length)).to.deep.equal([12, 1]);
    expect(
      batches.every(batch => batch.reduce((sum, [title]) => sum + title.length, 0) <= 720)
    ).to.equal(true);
  });

  it('pins the model, prompt, schema, settings, header, timeout, and validates usage', async function () {
    const requests: Array<{
      url: string;
      headers: Record<string, string>;
      body: string;
      timeoutMs: number;
    }> = [];
    const transport: GeminiVietnameseTitleTransport = {
      async send(request) {
        requests.push(request);
        return {
          status: 200,
          body: {
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        results: [
                          {
                            id: 'a',
                            status: 'translated',
                            restoredVi: 'Điện phân',
                            english: 'Electrolysis',
                            alternatives: [],
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 300,
              candidatesTokenCount: 20,
              thoughtsTokenCount: 0,
              totalTokenCount: 320,
            },
          },
        };
      },
    };
    const provider = new GeminiVietnameseTitleProvider(transport, 'test-secret');
    await provider.translate([{ id: 'a', text: 'Dien phan' }]);

    expect(requests).to.have.length(1);
    expect(requests[0].url).to.equal(
      `${GEMINI_VI_TITLE_ENDPOINT}/models/${GEMINI_VI_TITLE_MODEL}:generateContent`
    );
    expect(requests[0].headers).to.deep.equal({ 'content-type': 'application/json' });
    expect(requests[0].timeoutMs).to.equal(15000);
    const body = JSON.parse(requests[0].body);
    expect(body.systemInstruction.parts[0].text).to.contain(GEMINI_VI_TITLE_PROMPT_VERSION);
    expect(body.generationConfig).to.include({
      temperature: 0,
      candidateCount: 1,
      maxOutputTokens: 768,
      responseMimeType: 'application/json',
    });
    expect(body.generationConfig.thinkingConfig).to.deep.equal({ thinkingLevel: 'minimal' });
    expect(body.generationConfig.responseJsonSchema).to.be.an('object');
    expect(body).not.to.have.any.keys('tools', 'toolConfig', 'cachedContent');
    expect(requests[0].url).not.to.contain('test-secret');
    expect(requests[0].body).not.to.contain('test-secret');
  });

  it('fails closed on missing usage, truncation, malformed JSON, and duplicate IDs', async function () {
    const bodies: unknown[] = [
      {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"results":[]}' }] } }],
      },
      { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] },
      {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not-json' }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      },
      {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: JSON.stringify({ results: [badResult('a'), badResult('a')] }) }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      },
    ];
    for (const body of bodies) {
      const provider = new GeminiVietnameseTitleProvider(
        {
          async send() {
            return { status: 200, body };
          },
        },
        'secret'
      );
      try {
        await provider.translate(
          body === bodies[3]
            ? [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
              ]
            : [{ id: 'a', text: 'A' }]
        );
        expect.fail('malformed provider response should fail');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    }
  });

  it('fails closed on blocks, HTTP errors, excessive usage, and oversized requests', async function () {
    const bodies: Array<{ status: number; body: unknown }> = [
      { status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } },
      { status: 429, body: { error: { message: 'quota denied' } } },
      {
        status: 200,
        body: {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: JSON.stringify({ results: [badResult('a')] }) }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 4097,
            candidatesTokenCount: 1,
            totalTokenCount: 4098,
          },
        },
      },
    ];
    for (const response of bodies) {
      const provider = new GeminiVietnameseTitleProvider(
        {
          async send() {
            return response;
          },
        },
        'secret'
      );
      try {
        await provider.translate([{ id: 'a', text: 'A' }]);
        expect.fail('unsafe provider response should fail');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    }

    process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS = '1';
    const provider = new GeminiVietnameseTitleProvider(
      {
        async send() {
          throw new Error('must not send');
        },
      },
      'secret'
    );
    try {
      await provider.translate([{ id: 'a', text: 'A' }]);
      expect.fail('oversized request should fail');
    } catch (error) {
      expect((error as Error).message).to.contain('reserves');
    } finally {
      delete process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS;
    }
  });

  it('keeps the API key out of the URL/body and redacts secrets and source text from errors', async function () {
    const originalFetch = global.fetch;
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    let seenBody = '';
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(input);
      seenHeaders = init?.headers as Record<string, string>;
      seenBody = String(init?.body ?? '');
      return {
        status: 500,
        async text() {
          return '{}';
        },
      } as Response;
    }) as typeof fetch;
    try {
      await createGeminiVietnameseTitleTransport('transport-secret').send({
        url: 'https://example.test/generate',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        timeoutMs: 100,
      });
    } finally {
      global.fetch = originalFetch;
    }
    expect(seenUrl).not.to.contain('transport-secret');
    expect(seenBody).not.to.contain('transport-secret');
    expect(seenHeaders['x-goog-api-key']).to.equal('transport-secret');

    const provider = new GeminiVietnameseTitleProvider(
      {
        async send() {
          throw new Error('test-secret Dien phan'.padEnd(500, 'x'));
        },
      },
      'test-secret'
    );
    try {
      await provider.translate([{ id: 'a', text: 'Dien phan' }]);
      expect.fail('transport failure should propagate safely');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.to.contain('test-secret');
      expect(message).not.to.contain('Dien phan');
      expect(message.length).to.be.at.most(300);
    }
  });
});

function badResult(id: string): VietnameseTitleResult {
  return { id, status: 'translated', restoredVi: 'A', english: 'B', alternatives: [] };
}
